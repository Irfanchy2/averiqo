"""Technical indicators.

Every function is *causal*: value[i] depends only on inputs[0..i]. This is enforced by
tests/test_indicators.py (prefix-invariance test), which is what prevents look-ahead bias and
repainting in the backtester. Warm-up values are NaN.
"""
from __future__ import annotations

import numpy as np

from app.core.types import Candles


def sma(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(x.shape, np.nan)
    if len(x) < n:
        return out
    cs = np.cumsum(np.insert(x.astype(float), 0, 0.0))
    out[n - 1:] = (cs[n:] - cs[:-n]) / n
    return out


def ema(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(x.shape, np.nan)
    if len(x) < n:
        return out
    a = 2.0 / (n + 1)
    out[n - 1] = np.mean(x[:n])
    for i in range(n, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def rma(x: np.ndarray, n: int) -> np.ndarray:
    """Wilder's smoothing (used by RSI, ATR, ADX). NaNs at the start of x are skipped."""
    out = np.full(x.shape, np.nan)
    valid = np.flatnonzero(~np.isnan(x))
    if len(valid) < n:
        return out
    s = valid[0]
    if s + n > len(x):
        return out
    out[s + n - 1] = np.mean(x[s:s + n])
    for i in range(s + n, len(x)):
        out[i] = (out[i - 1] * (n - 1) + x[i]) / n
    return out


def true_range(c: Candles) -> np.ndarray:
    prev = np.r_[np.nan, c.close[:-1]]
    tr = np.maximum(c.high - c.low, np.maximum(np.abs(c.high - prev), np.abs(c.low - prev)))
    tr[0] = c.high[0] - c.low[0]
    return tr


def atr(c: Candles, n: int = 14) -> np.ndarray:
    return rma(true_range(c), n)


def rsi(x: np.ndarray, n: int = 14) -> np.ndarray:
    d = np.diff(x, prepend=np.nan)
    gain = np.where(d > 0, d, 0.0)
    loss = np.where(d < 0, -d, 0.0)
    gain[0] = loss[0] = np.nan
    ag, al = rma(gain, n), rma(loss, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = ag / al
        out = 100 - 100 / (1 + rs)
    out = np.where((al == 0) & ~np.isnan(ag), 100.0, out)
    return out


def macd(x: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9):
    line = ema(x, fast) - ema(x, slow)
    sig = np.full(x.shape, np.nan)
    valid = np.flatnonzero(~np.isnan(line))
    if len(valid) >= signal:
        sig[valid[0]:] = ema(line[valid[0]:], signal)
    return line, sig, line - sig


def bollinger(x: np.ndarray, n: int = 20, k: float = 2.0):
    mid = sma(x, n)
    sd = np.full(x.shape, np.nan)
    for i in range(n - 1, len(x)):
        sd[i] = np.std(x[i - n + 1:i + 1])
    return mid + k * sd, mid, mid - k * sd


def vwap(c: Candles, anchor_seconds: int = 86400) -> np.ndarray:
    """Session-anchored VWAP (default: resets each UTC day)."""
    tp = (c.high + c.low + c.close) / 3
    session = c.time // anchor_seconds
    out = np.empty(len(c))
    pv = vv = 0.0
    for i in range(len(c)):
        if i == 0 or session[i] != session[i - 1]:
            pv = vv = 0.0
        pv += tp[i] * c.volume[i]
        vv += c.volume[i]
        out[i] = pv / vv if vv > 0 else tp[i]
    return out


def supertrend(c: Candles, n: int = 10, mult: float = 3.0):
    """Returns (line, direction) where direction is +1 (up) / -1 (down)."""
    a = atr(c, n)
    hl2 = (c.high + c.low) / 2
    upper = hl2 + mult * a
    lower = hl2 - mult * a
    line = np.full(len(c), np.nan)
    dirn = np.zeros(len(c))
    fu, fl = np.nan, np.nan
    for i in range(len(c)):
        if np.isnan(a[i]):
            continue
        if np.isnan(fu):
            fu, fl, dirn[i] = upper[i], lower[i], 1
        else:
            fu = upper[i] if (upper[i] < fu or c.close[i - 1] > fu) else fu
            fl = lower[i] if (lower[i] > fl or c.close[i - 1] < fl) else fl
            prev = dirn[i - 1] or 1
            if prev > 0 and c.close[i] < fl:
                dirn[i] = -1
            elif prev < 0 and c.close[i] > fu:
                dirn[i] = 1
            else:
                dirn[i] = prev
        line[i] = fl if dirn[i] > 0 else fu
    return line, dirn


def adx(c: Candles, n: int = 14):
    """Returns (adx, +DI, -DI)."""
    up = np.diff(c.high, prepend=np.nan)
    dn = -np.diff(c.low, prepend=np.nan)
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    mdm = np.where((dn > up) & (dn > 0), dn, 0.0)
    pdm[0] = mdm[0] = np.nan
    tr = true_range(c).astype(float)
    tr[0] = np.nan
    atr_ = rma(tr, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        pdi = 100 * rma(pdm, n) / atr_
        mdi = 100 * rma(mdm, n) / atr_
        dx = 100 * np.abs(pdi - mdi) / (pdi + mdi)
    return rma(dx, n), pdi, mdi


def stoch_rsi(x: np.ndarray, n: int = 14, k: int = 3, d: int = 3):
    r = rsi(x, n)
    st = np.full(x.shape, np.nan)
    for i in range(len(x)):
        w = r[max(0, i - n + 1):i + 1]
        if i - n + 1 < 0 or np.isnan(w).any():
            continue
        lo, hi = w.min(), w.max()
        st[i] = 100 * (r[i] - lo) / (hi - lo) if hi > lo else 50.0
    kk = _nan_sma(st, k)
    return kk, _nan_sma(kk, d)


def _nan_sma(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(x.shape, np.nan)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]
        if not np.isnan(w).any():
            out[i] = w.mean()
    return out


def obv(c: Candles) -> np.ndarray:
    sign = np.sign(np.diff(c.close, prepend=c.close[0]))
    return np.cumsum(sign * c.volume)


def realized_vol(x: np.ndarray, n: int = 20) -> np.ndarray:
    lr = np.diff(np.log(x), prepend=np.nan)
    out = np.full(x.shape, np.nan)
    for i in range(n, len(x)):
        out[i] = np.std(lr[i - n + 1:i + 1])
    return out


def percentile_rank(x: np.ndarray, n: int = 200) -> np.ndarray:
    """Causal rolling percentile rank of x[i] within the trailing window (0..1)."""
    out = np.full(x.shape, np.nan)
    for i in range(len(x)):
        w = x[max(0, i - n + 1):i + 1]
        w = w[~np.isnan(w)]
        if len(w) >= 20 and not np.isnan(x[i]):
            out[i] = float(np.mean(w <= x[i]))
    return out


def volume_profile(c: Candles, bins: int = 24) -> dict:
    """Volume-at-price histogram using each bar's typical price.

    Note: true volume profile requires tick/trade data. Bar-level approximation is labelled as such.
    """
    if len(c) == 0:
        return {"bins": [], "poc": None, "value_area": None, "approximation": "bar_typical_price"}
    tp = (c.high + c.low + c.close) / 3
    lo, hi = float(c.low.min()), float(c.high.max())
    edges = np.linspace(lo, hi, bins + 1)
    hist, _ = np.histogram(tp, bins=edges, weights=c.volume)
    poc_i = int(np.argmax(hist))
    order = np.argsort(hist)[::-1]
    total, acc, picked = hist.sum(), 0.0, []
    for j in order:
        picked.append(j)
        acc += hist[j]
        if acc >= 0.7 * total:
            break
    return {
        "bins": [{"low": float(edges[i]), "high": float(edges[i + 1]), "volume": float(hist[i])}
                 for i in range(bins)],
        "poc": float((edges[poc_i] + edges[poc_i + 1]) / 2),
        "value_area": {"low": float(edges[min(picked)]), "high": float(edges[max(picked) + 1])},
        "approximation": "bar_typical_price",
    }


# ------------------------------------------------------------------ registry / combinations

INDICATOR_CATALOG = {
    "ema": {"params": {"period": [9, 21, 50, 200]}, "overlay": True},
    "sma": {"params": {"period": [20, 50, 100, 200]}, "overlay": True},
    "vwap": {"params": {}, "overlay": True},
    "bollinger": {"params": {"period": 20, "k": 2.0}, "overlay": True},
    "supertrend": {"params": {"period": 10, "mult": 3.0}, "overlay": True},
    "rsi": {"params": {"period": 14}, "overlay": False},
    "macd": {"params": {"fast": 12, "slow": 26, "signal": 9}, "overlay": False},
    "atr": {"params": {"period": 14}, "overlay": False},
    "adx": {"params": {"period": 14}, "overlay": False},
    "stoch_rsi": {"params": {"period": 14, "k": 3, "d": 3}, "overlay": False},
    "obv": {"params": {}, "overlay": False},
}


def compute_indicator(c: Candles, name: str, params: dict | None = None) -> dict[str, np.ndarray]:
    p = params or {}
    x = c.close
    if name == "ema":
        n = int(p.get("period", 21)); return {f"ema{n}": ema(x, n)}
    if name == "sma":
        n = int(p.get("period", 50)); return {f"sma{n}": sma(x, n)}
    if name == "vwap":
        return {"vwap": vwap(c)}
    if name == "bollinger":
        u, m, lo = bollinger(x, int(p.get("period", 20)), float(p.get("k", 2.0)))
        return {"bb_upper": u, "bb_mid": m, "bb_lower": lo}
    if name == "supertrend":
        line, d = supertrend(c, int(p.get("period", 10)), float(p.get("mult", 3.0)))
        return {"supertrend": line, "supertrend_dir": d}
    if name == "rsi":
        return {"rsi": rsi(x, int(p.get("period", 14)))}
    if name == "macd":
        line, sig, hist = macd(x, int(p.get("fast", 12)), int(p.get("slow", 26)), int(p.get("signal", 9)))
        return {"macd": line, "macd_signal": sig, "macd_hist": hist}
    if name == "atr":
        return {"atr": atr(c, int(p.get("period", 14)))}
    if name == "adx":
        a, pdi, mdi = adx(c, int(p.get("period", 14)))
        return {"adx": a, "plus_di": pdi, "minus_di": mdi}
    if name == "stoch_rsi":
        k, d = stoch_rsi(x, int(p.get("period", 14)), int(p.get("k", 3)), int(p.get("d", 3)))
        return {"stoch_k": k, "stoch_d": d}
    if name == "obv":
        return {"obv": obv(c)}
    raise KeyError(f"Unknown indicator {name!r}")


class IndicatorSet:
    """Standard indicator bundle consumed by the decision engine (all arrays aligned to candles)."""

    def __init__(self, c: Candles):
        x = c.close
        self.ema9, self.ema21, self.ema50, self.ema200 = ema(x, 9), ema(x, 21), ema(x, 50), ema(x, 200)
        self.rsi = rsi(x, 14)
        self.macd, self.macd_signal, self.macd_hist = macd(x)
        self.atr = atr(c, 14)
        self.adx, self.plus_di, self.minus_di = adx(c, 14)
        self.supertrend, self.supertrend_dir = supertrend(c)
        self.vwap = vwap(c)
        self.atr_pct_rank = percentile_rank(self.atr / x, 200)
        self.vol_sma = sma(c.volume, 20)
