import numpy as np
import pytest

from app.indicators import core as ind
from tests.conftest import make_candles


def test_sma_ema_basic():
    x = np.arange(1, 11, dtype=float)
    assert ind.sma(x, 3)[2] == pytest.approx(2.0)
    assert ind.sma(x, 3)[-1] == pytest.approx(9.0)
    e = ind.ema(x, 3)
    assert np.isnan(e[1]) and e[2] == pytest.approx(2.0)
    assert e[3] == pytest.approx(0.5 * 4 + 0.5 * 2.0)


def test_rsi_extremes():
    up = np.arange(1, 50, dtype=float)
    assert ind.rsi(up)[-1] == pytest.approx(100.0)
    down = up[::-1].copy()
    assert ind.rsi(down)[-1] == pytest.approx(0.0)


def test_rsi_bounded(candles_1h):
    r = ind.rsi(candles_1h.close)
    v = r[~np.isnan(r)]
    assert (v >= 0).all() and (v <= 100).all()


def test_atr_constant_range():
    c = make_candles([100.0] * 40, spread=1.0)
    assert ind.atr(c, 14)[-1] == pytest.approx(2.0)


def test_macd_hist_identity(candles_1h):
    line, sig, hist = ind.macd(candles_1h.close)
    m = ~np.isnan(hist)
    assert np.allclose(hist[m], (line - sig)[m])


def test_bollinger_order(candles_1h):
    u, mid, lo = ind.bollinger(candles_1h.close)
    m = ~np.isnan(u)
    assert (u[m] >= mid[m]).all() and (mid[m] >= lo[m]).all()


def test_supertrend_flips_on_trend():
    c = make_candles(list(np.linspace(100, 150, 60)) + list(np.linspace(150, 90, 60)))
    _, d = ind.supertrend(c)
    assert d[55] == 1 and d[-1] == -1


def test_adx_strong_trend():
    c = make_candles(np.linspace(100, 200, 120))
    a, pdi, mdi = ind.adx(c)
    assert a[-1] > 40 and pdi[-1] > mdi[-1]


def test_vwap_resets_daily():
    c = make_candles([10.0] * 30 + [20.0] * 30, spread=0.0, step=3600)
    v = ind.vwap(c)
    day = c.time // 86400
    first_of_day = np.flatnonzero(np.r_[True, day[1:] != day[:-1]])
    for i in first_of_day:
        assert v[i] == pytest.approx((c.high[i] + c.low[i] + c.close[i]) / 3)


def test_volume_profile_poc(candles_1h):
    vp = ind.volume_profile(candles_1h)
    assert vp["value_area"]["low"] <= vp["poc"] <= vp["value_area"]["high"]


@pytest.mark.parametrize("name", list(ind.INDICATOR_CATALOG))
def test_indicators_are_causal(candles_1h, name):
    """No look-ahead: computing on a prefix must equal the prefix of the full computation."""
    c = candles_1h.slice(0, 400)
    full = ind.compute_indicator(c, name)
    cut = 300
    part = ind.compute_indicator(c.slice(0, cut), name)
    for k in full:
        a, b = full[k][:cut], part[k]
        assert np.allclose(a, b, equal_nan=True), f"{name}.{k} repaints"
