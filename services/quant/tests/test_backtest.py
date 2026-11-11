import numpy as np

from app.backtest.engine import BacktestConfig, run_backtest, walk_forward
from app.core.types import HTF_MAP
from app.data.instruments import get_instrument
from app.engine.decision import MarketContext, StrategyParams, evaluate


def ctx_for(provider, sym="BTCUSDT", tf="1h", bars=1500):
    return MarketContext(get_instrument(sym), tf, provider.closed_candles(sym, tf, bars),
                         provider.closed_candles(sym, HTF_MAP[tf], 600))


def test_entries_fill_on_next_bar_open(provider):
    ctx = ctx_for(provider)
    res = run_backtest(ctx, StrategyParams(), BacktestConfig())
    assert res["trades"], "expected at least one trade on 1500 bars"
    for tr in res["trades"]:
        assert tr["entry_idx"] == tr["signal_idx"] + 1
        assert tr["entry_time"] == int(ctx.c.time[tr["entry_idx"]])
        # entry price is derived from that bar's open (plus costs), never the signal bar close
        assert abs(tr["entry"] - ctx.c.open[tr["entry_idx"]]) < 0.01 * ctx.c.open[tr["entry_idx"]]


def test_metrics_consistency(provider):
    ctx = ctx_for(provider)
    res = run_backtest(ctx, StrategyParams(), BacktestConfig())
    m = res["metrics"]
    total = sum(t["pnl"] for t in res["trades"])
    assert np.isclose(total, m["net_profit"], atol=1.0)
    assert 0 <= m["max_drawdown_pct"] <= 100
    assert m["trades"] == len(res["trades"])
    assert any("SIMULATED" in s for s in res["limitations"])


def test_htf_alignment_has_no_lookahead(provider):
    ctx = ctx_for(provider)
    from app.core.types import TIMEFRAMES
    ltf_close = ctx.c.time + TIMEFRAMES[ctx.tf]
    htf_close = ctx.htf.time + TIMEFRAMES[ctx.htf_tf]
    for t in range(300, len(ctx.c), 97):
        j = ctx.htf_idx[t]
        assert htf_close[j] <= ltf_close[t]
        if j + 1 < len(ctx.htf):
            assert htf_close[j + 1] > ltf_close[t]


def test_signal_identical_with_truncated_future(provider):
    """Evaluating at bar t must not depend on bars after t."""
    full = ctx_for(provider, bars=900)
    t = 700
    cut = MarketContext(full.inst, full.tf, full.c.slice(0, t + 1), full.htf)
    a = evaluate(full, t, StrategyParams(), with_drawings_snapshot=False)
    b = evaluate(cut, t, StrategyParams(), with_drawings_snapshot=False)
    assert a["status"] == b["status"] and a["quality"] == b["quality"]
    assert (a["plan"] or {}).get("stop_loss") == (b["plan"] or {}).get("stop_loss")


def test_walk_forward_runs(provider):
    ctx = ctx_for(provider, bars=1200)
    wf = walk_forward(ctx, StrategyParams(), BacktestConfig(), folds=3)
    assert len(wf["folds"]) == 3
    for f in wf["folds"]:
        assert f["oos_start"] > f["is_start"]


def test_never_single_indicator(provider):
    ctx = ctx_for(provider, bars=900)
    for t in range(300, 899, 7):
        r = evaluate(ctx, t, StrategyParams(), with_drawings_snapshot=False)
        if r["status"] in ("bullish_setup", "bearish_setup"):
            ind = next(L for L in r["layers"] if L["key"] == "indicators")
            assert len([d for d in ind["details"] if not d.startswith("✗")]) >= 2
            assert not r["missing"]
