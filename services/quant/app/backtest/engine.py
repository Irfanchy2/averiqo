"""Event-driven bar backtester for the decision engine.

Bias controls:
* Signals are evaluated at the CLOSE of bar t using `StructureAnalysis.snapshot(t)` and causal
  indicators; orders fill at the OPEN of bar t+1 (never at the signal bar's close).
* Higher-timeframe context uses only HTF bars closed at or before the LTF bar close.
* Intrabar ambiguity: if stop and target are both inside a bar's range, the STOP is assumed first.
* Gaps: if a bar opens beyond the stop, the fill is at the open (worse), not at the stop.
* Costs: spread (half on each side), slippage (bps per side) and fees/commission on every fill.
* No historical news calendar is available, so the news layer is NOT applied in backtests
  (reported in the result as a limitation).
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import numpy as np

from app.core.types import TIMEFRAMES
from app.data.instruments import quote_to_account
from app.engine.costs import default_slippage_bps
from app.engine.decision import MarketContext, StrategyParams, evaluate
from app.risk.engine import round_qty


@dataclass
class BacktestConfig:
    initial_equity: float = 10_000.0
    risk_pct: float = 1.0
    spread: float | None = None  # default: instrument typical spread
    slippage_bps: float | None = None
    scale_out: tuple[float, float, float] = (0.5, 0.3, 0.2)
    move_stop_to_breakeven: bool = True
    max_bars_in_trade: int = 96
    warmup: int = 220


@dataclass
class Trade:
    direction: str
    signal_idx: int
    entry_idx: int
    entry_time: int
    entry: float
    stop: float
    tps: list[float]
    qty: float
    quality: int
    regime: str
    exit_idx: int = -1
    exit_time: int = 0
    exit_price: float = 0.0
    exit_reason: str = ""
    pnl: float = 0.0
    fees: float = 0.0
    r_multiple: float = 0.0
    legs: list[dict] = field(default_factory=list)


def regime_at(ctx: MarketContext, t: int) -> str:
    ind = ctx.ind
    if not np.isnan(ind.atr_pct_rank[t]) and ind.atr_pct_rank[t] > 0.8:
        return "high_volatility"
    if not np.isnan(ind.adx[t]) and ind.adx[t] >= 25:
        return "trending_up" if ind.plus_di[t] > ind.minus_di[t] else "trending_down"
    return "ranging"


def run_backtest(ctx: MarketContext, params: StrategyParams, cfg: BacktestConfig,
                 start: int | None = None, end: int | None = None, simulated_data: bool = True) -> dict:
    c, inst = ctx.c, ctx.inst
    n = len(c)
    start = max(cfg.warmup, start or 0)
    end = min(n - 1, end if end is not None else n - 1)
    spread = cfg.spread if cfg.spread is not None else inst.typical_spread
    slip = cfg.slippage_bps if cfg.slippage_bps is not None else default_slippage_bps(inst)
    equity = cfg.initial_equity
    trades: list[Trade] = []
    curve: list[tuple[int, float]] = []
    open_tr: Trade | None = None
    remaining = 0.0
    stop = 0.0
    tp_hit = 0
    signals = 0

    def fill_price(raw: float, side: int) -> float:  # side +1 buy, -1 sell
        return raw + side * (spread / 2 + raw * slip / 10_000)

    def fee(price: float, qty: float) -> float:
        return qty * inst.contract_size * price * inst.taker_fee_rate + qty * inst.commission_per_lot

    conv = lambda p: quote_to_account(inst, p)  # noqa: E731

    t = start
    while t < end:
        # ---------------- manage open trade on bar t
        if open_tr is not None and t > open_tr.entry_idx - 1:
            d = 1 if open_tr.direction == "long" else -1
            o, h, lo, cl = c.open[t], c.high[t], c.low[t], c.close[t]
            closed = False
            # stop first (conservative); gap-through handled by using the open
            stop_hit = (lo <= stop) if d > 0 else (h >= stop)
            if stop_hit and t >= open_tr.entry_idx:
                raw = min(o, stop) if d > 0 else max(o, stop)
                px = fill_price(raw, -d)
                f = fee(px, remaining)
                pnl = d * (px - open_tr.entry) * remaining * inst.contract_size * conv(px) - f
                open_tr.legs.append({"idx": t, "qty": remaining, "price": px, "reason": "stop" if tp_hit == 0 else "breakeven_stop"})
                open_tr.pnl += pnl; open_tr.fees += f; equity += pnl
                open_tr.exit_reason = "stop_loss" if tp_hit == 0 else "stop_after_tp"
                closed = True
            else:
                while tp_hit < 3 and not closed:
                    tp = open_tr.tps[tp_hit]
                    if (h >= tp) if d > 0 else (lo <= tp):
                        q = remaining if tp_hit == 2 else round_qty(inst, open_tr.qty * cfg.scale_out[tp_hit])
                        q = min(q, remaining) if q > 0 else remaining
                        raw = max(o, tp) if d > 0 else min(o, tp)
                        px = fill_price(raw, -d)
                        f = fee(px, q)
                        pnl = d * (px - open_tr.entry) * q * inst.contract_size * conv(px) - f
                        open_tr.legs.append({"idx": t, "qty": q, "price": px, "reason": f"tp{tp_hit + 1}"})
                        open_tr.pnl += pnl; open_tr.fees += f; equity += pnl
                        remaining = round(remaining - q, 10)
                        tp_hit += 1
                        if tp_hit == 1 and cfg.move_stop_to_breakeven:
                            stop = open_tr.entry
                        if remaining <= 1e-12:
                            open_tr.exit_reason = f"tp{tp_hit}"
                            closed = True
                    else:
                        break
                if not closed and t - open_tr.entry_idx >= cfg.max_bars_in_trade:
                    px = fill_price(cl, -d)
                    f = fee(px, remaining)
                    pnl = d * (px - open_tr.entry) * remaining * inst.contract_size * conv(px) - f
                    open_tr.legs.append({"idx": t, "qty": remaining, "price": px, "reason": "time"})
                    open_tr.pnl += pnl; open_tr.fees += f; equity += pnl
                    open_tr.exit_reason = "time_exit"
                    closed = True
            if closed:
                risk_amt = abs(open_tr.entry - open_tr.stop) * open_tr.qty * inst.contract_size * conv(open_tr.entry)
                open_tr.r_multiple = open_tr.pnl / risk_amt if risk_amt > 0 else 0.0
                open_tr.exit_idx, open_tr.exit_time = t, int(c.time[t])
                open_tr.exit_price = open_tr.legs[-1]["price"]
                trades.append(open_tr)
                open_tr = None

        # ---------------- mark to market
        mtm = equity
        if open_tr is not None and t >= open_tr.entry_idx:
            d = 1 if open_tr.direction == "long" else -1
            mtm += d * (c.close[t] - open_tr.entry) * remaining * inst.contract_size * conv(c.close[t])
        curve.append((int(c.time[t]), float(mtm)))

        # ---------------- new signal at close of t -> fill at open of t+1
        if open_tr is None and equity > 0:
            sig = evaluate(ctx, t, params, spread=spread, news_blackout=None, with_drawings_snapshot=False)
            if sig["status"] in ("bullish_setup", "bearish_setup"):
                signals += 1
                plan = sig["plan"]
                d = 1 if sig["direction"] == "long" else -1
                nxt = t + 1
                px = fill_price(c.open[nxt], d)
                sl = plan["stop_loss"]
                tps = plan["take_profits"]
                # skip if the next open already invalidated the plan (gap through stop or TP1)
                if (d > 0 and (px <= sl or px >= tps[0])) or (d < 0 and (px >= sl or px <= tps[0])):
                    t += 1
                    continue
                per_unit = abs(px - sl) * inst.contract_size * conv(px)
                qty = round_qty(inst, equity * cfg.risk_pct / 100 / per_unit) if per_unit > 0 else 0
                if qty >= inst.min_qty:
                    f = fee(px, qty)
                    equity -= f
                    open_tr = Trade(sig["direction"], t, nxt, int(c.time[nxt]), float(px), float(sl), list(tps), qty,
                                    sig["quality"], regime_at(ctx, t), fees=f, pnl=-f)
                    open_tr.legs.append({"idx": nxt, "qty": qty, "price": px, "reason": "entry"})
                    remaining, stop, tp_hit = qty, float(sl), 0
        t += 1

    if open_tr is not None:  # close at last bar
        d = 1 if open_tr.direction == "long" else -1
        px = fill_price(c.close[end], -d)
        f = fee(px, remaining)
        pnl = d * (px - open_tr.entry) * remaining * inst.contract_size * conv(px) - f
        open_tr.pnl += pnl; open_tr.fees += f; equity += pnl
        risk_amt = abs(open_tr.entry - open_tr.stop) * open_tr.qty * inst.contract_size * conv(open_tr.entry)
        open_tr.r_multiple = open_tr.pnl / risk_amt if risk_amt > 0 else 0.0
        open_tr.exit_idx, open_tr.exit_time, open_tr.exit_price, open_tr.exit_reason = end, int(c.time[end]), px, "end_of_test"
        trades.append(open_tr)
        curve.append((int(c.time[end]), float(equity)))

    return {
        "symbol": inst.symbol, "timeframe": ctx.tf, "strategy": params.to_dict(), "config": asdict(cfg),
        "period": {"start": int(c.time[start]), "end": int(c.time[end]), "bars": end - start},
        "signals": signals,
        "metrics": compute_metrics(trades, curve, cfg.initial_equity, TIMEFRAMES[ctx.tf]),
        "by_regime": by_group(trades, "regime"),
        "calibration": calibration_table(trades),
        "trades": [asdict(x) for x in trades],
        "equity_curve": [{"time": a, "equity": round(b, 2)} for a, b in curve],
        "limitations": [
            "News blackout layer not applied: no historical economic-calendar data configured.",
            "Spread modelled as constant typical spread; real spreads widen around news and rollover.",
            "Bar-level simulation: intrabar path unknown, stop assumed to trigger before target.",
        ] + (["Market data is SIMULATED — results say nothing about real-market performance."]
             if simulated_data else []),
    }


def compute_metrics(trades: list[Trade], curve: list[tuple[int, float]], initial: float, tf_s: int) -> dict:
    eq = np.array([e for _, e in curve]) if curve else np.array([initial])
    peak = np.maximum.accumulate(eq)
    dd = (eq - peak) / peak
    n = len(trades)
    pnls = np.array([x.pnl for x in trades])
    rs = np.array([x.r_multiple for x in trades])
    wins = pnls[pnls > 0]
    losses = pnls[pnls <= 0]
    max_consec = cur = 0
    for p in pnls:
        cur = cur + 1 if p <= 0 else 0
        max_consec = max(max_consec, cur)
    # Sharpe on daily-resampled equity returns (annualised with 365 for crypto-like 24/7 data)
    sharpe = None
    if len(curve) > 2:
        times = np.array([t for t, _ in curve])
        day = times // 86400
        idx = np.flatnonzero(np.r_[day[1:] != day[:-1], True])
        daily = eq[idx]
        if len(daily) > 10:
            r = np.diff(daily) / daily[:-1]
            if r.std() > 0:
                sharpe = float(r.mean() / r.std() * math.sqrt(365))
    gross_loss = -losses.sum()
    return {
        "trades": n,
        "net_profit": round(float(eq[-1] - initial), 2),
        "return_pct": round(float(100 * (eq[-1] / initial - 1)), 2),
        "win_rate": round(float(len(wins) / n), 4) if n else None,
        "profit_factor": round(float(wins.sum() / gross_loss), 3) if gross_loss > 0 else (None if n == 0 else math.inf),
        "expectancy": round(float(pnls.mean()), 2) if n else None,
        "expectancy_r": round(float(rs.mean()), 3) if n else None,
        "avg_win": round(float(wins.mean()), 2) if len(wins) else None,
        "avg_loss": round(float(losses.mean()), 2) if len(losses) else None,
        "max_drawdown_pct": round(float(-100 * dd.min()), 2),
        "max_consecutive_losses": int(max_consec),
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "sharpe_note": "Daily returns, annualised √365; unreliable with few trades/days.",
        "total_fees": round(float(sum(x.fees for x in trades)), 2),
        "sample_warning": n < 30,
    }


def by_group(trades: list[Trade], key: str) -> dict:
    out = {}
    for g in sorted({getattr(x, key) for x in trades}):
        sub = [x for x in trades if getattr(x, key) == g]
        pn = np.array([x.pnl for x in sub])
        out[g] = {"trades": len(sub), "win_rate": round(float((pn > 0).mean()), 3),
                  "expectancy_r": round(float(np.mean([x.r_multiple for x in sub])), 3), "net": round(float(pn.sum()), 2)}
    return out


QUALITY_BUCKETS = [(0, 55), (55, 70), (70, 85), (85, 101)]


def calibration_table(trades: list[Trade]) -> list[dict]:
    rows = []
    for lo, hi in QUALITY_BUCKETS:
        sub = [x for x in trades if lo <= x.quality < hi]
        rows.append({
            "quality_range": [lo, hi - 1 if hi == 101 else hi],
            "trades": len(sub),
            "win_rate": round(float(np.mean([x.pnl > 0 for x in sub])), 3) if sub else None,
            "expectancy_r": round(float(np.mean([x.r_multiple for x in sub])), 3) if sub else None,
        })
    return rows


# ------------------------------------------------------------------ validation protocols

PARAM_GRID = [
    {"min_rr": 1.5, "sl_buffer_atr": 0.25},
    {"min_rr": 2.0, "sl_buffer_atr": 0.25},
    {"min_rr": 1.5, "sl_buffer_atr": 0.5},
    {"min_rr": 2.0, "sl_buffer_atr": 0.5},
]


def out_of_sample(ctx: MarketContext, params: StrategyParams, cfg: BacktestConfig, is_fraction: float = 0.7) -> dict:
    n = len(ctx.c)
    split = int(cfg.warmup + (n - cfg.warmup) * is_fraction)
    ins = run_backtest(ctx, params, cfg, cfg.warmup, split)
    oos = run_backtest(ctx, params, cfg, split, n - 1)
    return {"split_time": int(ctx.c.time[split]), "in_sample": ins["metrics"], "out_of_sample": oos["metrics"]}


def walk_forward(ctx: MarketContext, base: StrategyParams, cfg: BacktestConfig, folds: int = 4,
                 is_fraction: float = 0.7) -> dict:
    """Rolling walk-forward: optimise on each in-sample window over a small grid by expectancy (R),
    then evaluate the chosen parameters on the following unseen window."""
    n = len(ctx.c)
    usable = n - cfg.warmup
    win = usable // folds
    rows, oos_trades = [], []
    for k in range(folds):
        s = cfg.warmup + k * win
        e = min(n - 1, s + win)
        split = s + int(win * is_fraction)
        best, best_score = None, -math.inf
        for g in PARAM_GRID:
            p = StrategyParams.from_dict({**base.to_dict(), **g})
            m = run_backtest(ctx, p, cfg, s, split)["metrics"]
            score = (m["expectancy_r"] or -math.inf) if m["trades"] >= 3 else -math.inf
            if score > best_score:
                best, best_score = g, score
        best = best or PARAM_GRID[0]
        p = StrategyParams.from_dict({**base.to_dict(), **best})
        res = run_backtest(ctx, p, cfg, split, e)
        oos_trades += res["trades"]
        rows.append({"fold": k + 1, "is_start": int(ctx.c.time[s]), "oos_start": int(ctx.c.time[split]),
                     "oos_end": int(ctx.c.time[e]), "chosen_params": best,
                     "is_expectancy_r": None if best_score == -math.inf else round(best_score, 3),
                     "oos": res["metrics"]})
    rs = [x["r_multiple"] for x in oos_trades]
    return {"folds": rows, "oos_total_trades": len(rs),
            "oos_expectancy_r": round(float(np.mean(rs)), 3) if rs else None,
            "oos_win_rate": round(float(np.mean([x["pnl"] > 0 for x in oos_trades])), 3) if rs else None}
