"""Seven-layer deterministic trading decision engine.

The rules here — not a language model — decide whether a setup exists. The same function is used
for live analysis and in the backtester (via point-in-time snapshots), so the confidence calibration
reported to the user is measured on exactly these rules.

Statuses: bullish_setup | bearish_setup | neutral | wait_for_confirmation | no_trade
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from app.core.types import HTF_MAP, TIMEFRAMES, Candles
from app.data.instruments import Instrument
from app.engine.costs import default_slippage_bps, round_trip_cost_price
from app.indicators.core import IndicatorSet
from app.structure.detector import StructureAnalysis


@dataclass
class StrategyParams:
    name: str = "structure_confluence_v1"
    min_rr: float = 1.5  # net of costs, measured to TP2
    sl_buffer_atr: float = 0.25
    min_risk_atr: float = 0.5
    sweep_lookback: int = 12
    break_lookback: int = 20
    zone_proximity_atr: float = 1.0
    min_confirmations: int = 2  # never trade on a single indicator
    max_atr_pct_rank: float = 0.97
    max_spread_atr: float = 0.25

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict | None) -> "StrategyParams":
        p = StrategyParams()
        for k, v in (d or {}).items():
            if hasattr(p, k) and k != "name":
                setattr(p, k, type(getattr(p, k))(v))
        return p


@dataclass
class Layer:
    key: str
    name: str
    verdict: str  # bullish | bearish | neutral | pass | block | warn
    score: float  # -1..1 directional, or 0..1 for gating layers
    details: list[str] = field(default_factory=list)


class MarketContext:
    """Pre-computed analysis for one symbol/timeframe (+ its higher timeframe)."""

    def __init__(self, inst: Instrument, timeframe: str, ltf: Candles, htf: Candles | None):
        self.inst = inst
        self.tf = timeframe
        self.htf_tf = HTF_MAP[timeframe]
        self.c = ltf
        self.ind = IndicatorSet(ltf)
        self.sa = StructureAnalysis(ltf, timeframe)
        self.htf = htf if htf is not None and len(htf) >= 60 else None
        if self.htf is not None:
            self.htf_ind = IndicatorSet(self.htf)
            self.htf_sa = StructureAnalysis(self.htf, self.htf_tf)
            # index of the last HTF bar fully CLOSED at the close of each LTF bar (no look-ahead)
            close_t = ltf.time + TIMEFRAMES[timeframe]
            self.htf_idx = np.searchsorted(self.htf.time + TIMEFRAMES[self.htf_tf], close_t, side="right") - 1

    def htf_bias(self, t: int) -> Layer:
        if self.htf is None or self.htf_idx[t] < 50:
            return Layer("htf", "Higher-timeframe direction", "neutral", 0.0, ["Insufficient higher-timeframe history."])
        j = int(self.htf_idx[t])
        hi, hc = self.htf_ind, self.htf.close[j]
        trend = int(self.htf_sa.trend_at[j])
        notes, s = [], 0.0
        s += 0.4 * trend
        notes.append(f"{self.htf_tf} structure trend: {'bullish' if trend > 0 else 'bearish' if trend < 0 else 'undefined'}.")
        if not np.isnan(hi.ema50[j]) and not np.isnan(hi.ema200[j]):
            al = 1 if hi.ema50[j] > hi.ema200[j] else -1
            s += 0.3 * al
            notes.append(f"{self.htf_tf} EMA50 {'above' if al > 0 else 'below'} EMA200.")
        if not np.isnan(hi.ema50[j]):
            pos = 1 if hc > hi.ema50[j] else -1
            s += 0.3 * pos
            notes.append(f"{self.htf_tf} close {'above' if pos > 0 else 'below'} EMA50.")
        verdict = "bullish" if s >= 0.35 else "bearish" if s <= -0.35 else "neutral"
        return Layer("htf", "Higher-timeframe direction", verdict, round(s, 2), notes)


def evaluate(ctx: MarketContext, t: int, params: StrategyParams, *, spread: float | None = None,
             quote_age_s: float = 0.0, stale_limit_s: float = 30.0, news_blackout: dict | None = None,
             equity: float | None = None, risk_pct: float = 1.0, open_exposure_ok: bool = True,
             with_drawings_snapshot: bool = True) -> dict:
    c, ind, sa, inst = ctx.c, ctx.ind, ctx.sa, ctx.inst
    price = float(c.close[t])
    a = float(ind.atr[t]) if not np.isnan(ind.atr[t]) else float(c.high[t] - c.low[t])
    spread = inst.typical_spread if spread is None else spread
    layers: list[Layer] = []

    # ---- L1 HTF direction
    l1 = ctx.htf_bias(t)
    layers.append(l1)

    # ---- L2 structure & zones (cheap snapshot first)
    snap = sa.snapshot(t, full=False)
    ltf_trend = snap.trend
    direction = 1 if l1.verdict == "bullish" else -1 if l1.verdict == "bearish" else ltf_trend
    dname = "bullish" if direction > 0 else "bearish"
    l2_notes, l2_score = [], 0.0
    l2_notes.append(f"{ctx.tf} structure trend: {'bullish' if ltf_trend > 0 else 'bearish' if ltf_trend < 0 else 'undefined'}.")
    l2_score += 0.4 * ltf_trend
    zones = []
    for o in snap.order_blocks:
        zones.append(("order block", o.direction, o.top, o.bottom, o.touched_idx > t))
    for z in snap.sd_zones:
        zones.append((f"{z.kind} zone", "bullish" if z.kind == "demand" else "bearish", z.top, z.bottom, z.touched_idx > t))
    for f in snap.fvgs:
        zones.append(("FVG", f.direction, f.top, f.bottom, f.touched_idx > t))
    near = None
    if direction != 0:
        cands = [z for z in zones if z[1] == dname and
                 (z[3] - params.zone_proximity_atr * a <= price <= z[2] + params.zone_proximity_atr * a)]
        if cands:
            near = min(cands, key=lambda z: abs((z[2] + z[3]) / 2 - price))
            l2_notes.append(f"Price within {params.zone_proximity_atr}× ATR of a {dname} {near[0]} "
                            f"({near[3]:.5g}–{near[2]:.5g}){', untested' if near[4] else ''}.")
            l2_score += 0.4 * direction
        else:
            l2_notes.append(f"No {dname} order block / supply-demand zone / FVG near price.")
    full = sa.snapshot(t, full=True) if (with_drawings_snapshot or near is not None or direction != 0) else snap
    fib = full.fib
    if fib and direction != 0:
        good = (fib["zone"] == "discount") if direction > 0 else (fib["zone"] == "premium")
        l2_notes.append(f"Price in {fib['zone']} of the dealing range — {'favourable' if good else 'unfavourable'} location for {dname} entries.")
        l2_score += 0.2 * direction if good else -0.1 * direction
    layers.append(Layer("structure", "Market structure & zones", "bullish" if l2_score > 0.2 else "bearish" if l2_score < -0.2 else "neutral",
                        round(l2_score, 2), l2_notes))

    # ---- L3 liquidity & breakout behaviour
    l3_notes, trigger = [], None
    recent_sweeps = [s for s in snap.sweeps if t - s.idx <= params.sweep_lookback]
    recent_breaks = [b for b in snap.breaks if t - b.idx <= params.break_lookback]
    failed = [b for b in snap.breakouts if b.failed_idx <= t and t - b.failed_idx <= params.sweep_lookback]
    for s in recent_sweeps:
        if s.direction == dname:
            trigger = ("sweep", s)
            l3_notes.append(f"{'Sell' if s.direction == 'bullish' else 'Buy'}-side liquidity swept at {s.level:.5g} {t - s.idx} bar(s) ago and reclaimed (inferred stops).")
    for b in failed:
        if (b.direction == "bearish") == (direction > 0):
            trigger = trigger or ("failed_breakout", b)
            l3_notes.append(f"Failed {b.direction} breakout at {b.level:.5g} — trapped traders support a {dname} move.")
    for b in recent_breaks:
        if b.direction == dname:
            trigger = trigger or (b.kind, b)
            l3_notes.append(f"{b.kind} {b.direction} at {b.level:.5g}, {t - b.idx} bar(s) ago.")
        else:
            l3_notes.append(f"Opposing {b.kind} ({b.direction}) at {b.level:.5g}, {t - b.idx} bar(s) ago.")
    if not l3_notes:
        l3_notes.append("No recent liquidity sweep, failed breakout or structure break.")
    l3_score = (0.7 if trigger else 0.0) * direction
    layers.append(Layer("liquidity", "Liquidity & breakouts", dname if trigger else "neutral", l3_score, l3_notes))

    # ---- L4 indicator confirmation (multi-indicator, never single)
    conf, against = [], []

    def vote(ok: bool | None, txt_for: str, txt_against: str) -> None:
        if ok is None:
            return
        (conf if ok else against).append(txt_for if ok else txt_against)

    d = direction if direction != 0 else 1
    e21, e50 = ind.ema21[t], ind.ema50[t]
    vote(None if np.isnan(e50) else (e21 > e50) == (d > 0), "EMA21/EMA50 aligned", "EMA21/EMA50 opposed")
    vote((price > ind.vwap[t]) == (d > 0), "Price on the right side of VWAP", "Price on the wrong side of VWAP")
    mh = ind.macd_hist[t]
    vote(None if np.isnan(mh) else (mh > 0) == (d > 0), "MACD histogram supports", "MACD histogram opposes")
    r, r_prev = ind.rsi[t], ind.rsi[t - 1] if t > 0 else np.nan
    if not np.isnan(r) and not np.isnan(r_prev):
        ok = (45 <= r <= 70 and r >= r_prev) if d > 0 else (30 <= r <= 55 and r <= r_prev)
        vote(ok, f"RSI {r:.0f} with momentum", f"RSI {r:.0f} not confirming")
    vote(None if ind.supertrend_dir[t] == 0 else (ind.supertrend_dir[t] > 0) == (d > 0), "Supertrend agrees", "Supertrend disagrees")
    if not np.isnan(ind.adx[t]):
        strong = ind.adx[t] >= 20 and ((ind.plus_di[t] > ind.minus_di[t]) == (d > 0))
        vote(strong, f"ADX {ind.adx[t]:.0f} with directional agreement", f"ADX {ind.adx[t]:.0f} weak or opposing")
    n_conf = len(conf)
    l4_ok = n_conf >= params.min_confirmations and n_conf > len(against)
    layers.append(Layer("indicators", "Indicator confirmation", dname if l4_ok and direction else "neutral",
                        round((n_conf - len(against)) / 6 * d, 2), conf + [f"✗ {x}" for x in against]))

    # ---- L5 news / event risk
    if news_blackout is None:
        layers.append(Layer("news", "Economic news & event risk", "warn", 0.5, ["Event calendar not applied (no data for this bar)."]))
    elif news_blackout.get("active"):
        layers.append(Layer("news", "Economic news & event risk", "block", 0.0, [news_blackout["reason"]]))
    else:
        nxt = news_blackout.get("next_event")
        layers.append(Layer("news", "Economic news & event risk", "pass", 1.0,
                            ["No high-impact window active." + (f" Next: {nxt['title']} ({nxt['source']})." if nxt else "")]))

    # ---- L6 execution conditions
    l6_notes, l6_block = [], False
    if quote_age_s > stale_limit_s:
        l6_block = True; l6_notes.append(f"Market data stale ({quote_age_s:.0f}s old).")
    if a > 0 and spread > params.max_spread_atr * a:
        l6_block = True; l6_notes.append(f"Spread {spread:.5g} is {spread / a:.0%} of ATR — too expensive.")
    pr = ind.atr_pct_rank[t]
    if not np.isnan(pr) and pr > params.max_atr_pct_rank:
        l6_block = True; l6_notes.append(f"Volatility extreme (ATR in top {100 * (1 - pr):.0f}% of last 200 bars).")
    if not l6_block:
        l6_notes.append(f"Spread {spread:.5g} ({(spread / a if a else 0):.0%} of ATR); volatility percentile "
                        f"{(pr * 100 if not np.isnan(pr) else float('nan')):.0f}.")
    layers.append(Layer("execution", "Spread, slippage & volatility", "block" if l6_block else "pass", 0.0 if l6_block else 1.0, l6_notes))

    # ---- L7 risk / reward / exposure
    plan = None
    l7_notes: list[str] = []
    rr_ok = False
    if direction != 0:
        plan = _trade_plan(ctx, full, t, direction, near, trigger, params, spread, a)
        rr_ok = plan["rr_net_tp2"] >= params.min_rr
        l7_notes.append(f"Net R:R to TP2 {plan['rr_net_tp2']:.2f} (min {params.min_rr}) after estimated costs "
                        f"of {plan['cost_in_r']:.2f}R.")
        if equity:
            from app.risk.engine import position_size
            ps = position_size(inst, equity, risk_pct, plan["entry"], plan["stop_loss"])
            plan["position_size"] = ps
            if ps["note"]:
                l7_notes.append(ps["note"])
        if not open_exposure_ok:
            l7_notes.append("Portfolio exposure limit would be exceeded.")
    layers.append(Layer("risk_reward", "Risk/reward & exposure", "pass" if rr_ok and open_exposure_ok else "block" if plan else "neutral",
                        1.0 if rr_ok else 0.0, l7_notes or ["No directional bias — no trade plan computed."]))

    # ---- decision
    blocked = [L for L in layers if L.verdict == "block" and L.key in ("news", "execution")]
    aligned = direction != 0 and l1.verdict in (dname, "neutral") and ltf_trend in (direction, 0) and not (l1.verdict == "neutral" and ltf_trend == 0)
    htf_confirms = l1.verdict == dname
    has_location = near is not None
    missing = []
    if not htf_confirms: missing.append(f"{ctx.htf_tf} trend alignment")
    if not has_location: missing.append(f"price at a {dname} zone")
    if not trigger: missing.append("liquidity sweep / structure-break trigger")
    if not l4_ok: missing.append(f"≥{params.min_confirmations} indicator confirmations")

    if blocked:
        status = "no_trade"
    elif not aligned:
        status = "neutral"
    elif not missing:
        status = ("bullish_setup" if direction > 0 else "bearish_setup") if (rr_ok and open_exposure_ok) else "no_trade"
    elif len(missing) <= 2 and (has_location or trigger):
        status = "wait_for_confirmation"
    else:
        status = "neutral"

    quality = _quality(layers, direction, has_location, trigger is not None, l4_ok, rr_ok)
    reasons_for = [n for L in layers for n in L.details if L.verdict in (dname, "pass") and not n.startswith("✗")]
    reasons_against = [n for L in layers for n in L.details if L.verdict in ("block", "warn") or n.startswith("✗")
                       or (L.verdict in ("bullish", "bearish") and L.verdict != dname)]
    if status == "no_trade" and plan and not rr_ok and not blocked:
        reasons_against.insert(0, f"Reward does not justify risk: net R:R {plan['rr_net_tp2']:.2f} < {params.min_rr}.")
    for m in missing:
        reasons_against.append(f"Missing: {m}.")

    return {
        "symbol": inst.symbol, "timeframe": ctx.tf, "htf": ctx.htf_tf, "strategy": params.name,
        "bar_time": int(c.time[t]), "price": price, "atr": a,
        "status": status, "direction": None if direction == 0 else ("long" if direction > 0 else "short"),
        "quality": quality, "missing": missing,
        "entry_condition": _entry_condition(direction, near, trigger, ctx.tf) if direction else None,
        "plan": plan if status in ("bullish_setup", "bearish_setup", "wait_for_confirmation") or plan else None,
        "layers": [asdict(L) for L in layers],
        "reasons_for": reasons_for, "reasons_against": reasons_against,
        "invalidation": plan["invalidation"] if plan else None,
    }


def _quality(layers: list[Layer], direction: int, loc: bool, trig: bool, ind_ok: bool, rr_ok: bool) -> int:
    """Heuristic setup-quality score (0-100). NOT a probability; see calibration for hit rates."""
    if direction == 0:
        return 0
    by = {L.key: L for L in layers}
    s = 0.0
    s += 20 * max(0.0, by["htf"].score * direction)
    s += 20 * max(0.0, min(1.0, by["structure"].score * direction))
    s += 20 if trig else 0
    s += 15 * max(0.0, min(1.0, by["indicators"].score * direction * 1.5))
    s += 10 if loc else 0
    s += 15 if rr_ok else 0
    return int(round(s))


def _entry_condition(direction: int, near, trigger, tf: str) -> str:
    side = "long" if direction > 0 else "short"
    zone = f"inside the {near[0]} ({near[3]:.5g}–{near[2]:.5g})" if near else "on a retest of the nearest valid zone"
    trig = {"sweep": "after the liquidity sweep", "failed_breakout": "after the failed breakout",
            "BOS": "after the break of structure", "CHoCH": "after the change of character"}.get(trigger[0], "") if trigger else \
        "once a liquidity sweep or structure break confirms"
    return f"Enter {side} {zone} {trig}, on a {tf} candle closing in the trade direction."


def _trade_plan(ctx: MarketContext, snap, t: int, direction: int, near, trigger, p: StrategyParams,
                spread: float, a: float) -> dict:
    c, inst = ctx.c, ctx.inst
    price = float(c.close[t])
    if near:
        z_top, z_bot = near[2], near[3]
        if direction > 0:
            e_hi, e_lo = min(price, z_top), z_bot
        else:
            e_lo, e_hi = max(price, z_bot), z_top
        if e_hi < e_lo:
            e_lo, e_hi = e_hi, e_lo
    else:
        e_lo, e_hi = (price - 0.25 * a, price) if direction > 0 else (price, price + 0.25 * a)
    entry = price if (e_lo <= price <= e_hi) else (e_hi if direction > 0 else e_lo)

    # stop: beyond the structure that invalidates the idea
    refs = []
    if near:
        refs.append(near[3] if direction > 0 else near[2])
    if trigger and trigger[0] == "sweep":
        s = trigger[1]
        refs.append(float(c.low[s.idx]) if direction > 0 else float(c.high[s.idx]))
    lows = [s for s in snap.swings if s.kind == ("low" if direction > 0 else "high")]
    if lows:
        refs.append(lows[-1].price)
    if direction > 0:
        sl = min([r for r in refs if r < entry] or [entry - p.min_risk_atr * a]) - p.sl_buffer_atr * a
        sl = min(sl, entry - p.min_risk_atr * a)
    else:
        sl = max([r for r in refs if r > entry] or [entry + p.min_risk_atr * a]) + p.sl_buffer_atr * a
        sl = max(sl, entry + p.min_risk_atr * a)
    risk = abs(entry - sl)

    # targets: opposing liquidity / zones first, then R multiples
    if direction > 0:
        tgts = sorted({x["price"] for x in snap.liquidity if x["side"] == "BSL" and x["price"] > entry + 0.5 * risk} |
                      {z["bottom"] for z in snap.sr_zones if z["role"] == "resistance" and z["bottom"] > entry + 0.5 * risk})
    else:
        tgts = sorted({x["price"] for x in snap.liquidity if x["side"] == "SSL" and x["price"] < entry - 0.5 * risk} |
                      {z["top"] for z in snap.sr_zones if z["role"] == "support" and z["top"] < entry - 0.5 * risk}, reverse=True)
    rmult = [entry + direction * m * risk for m in (1.0, 2.0, 3.0)]
    tps = []
    for i in range(3):
        cand = tgts[i] if i < len(tgts) else rmult[i]
        if tps and (cand - tps[-1]) * direction <= 0:
            cand = tps[-1] + direction * risk
        tps.append(float(cand))
    slip_bps = default_slippage_bps(inst)
    cost = round_trip_cost_price(inst, entry, spread, slip_bps)
    rr = [abs(tp - entry) / risk for tp in tps]
    rr_net = (abs(tps[1] - entry) - cost) / (risk + cost)
    sources = ["liquidity/zone" if i < len(tgts) else f"{i + 1}R" for i in range(3)]
    return {
        "entry": float(entry), "entry_zone": [float(min(e_lo, e_hi)), float(max(e_lo, e_hi))],
        "stop_loss": float(sl), "take_profits": tps, "tp_sources": sources,
        "risk_per_unit": float(risk), "rr": [round(x, 2) for x in rr], "rr_net_tp2": round(float(rr_net), 2),
        "estimated_cost_per_unit": float(cost), "cost_in_r": round(float(cost / risk), 3) if risk else None,
        "cost_breakdown": {"spread": spread, "slippage_bps_per_side": slip_bps,
                           "fee_rate_per_side": inst.taker_fee_rate, "commission_per_lot_per_side": inst.commission_per_lot},
        "invalidation": f"Setup invalid on a {ctx.tf} close {'below' if direction > 0 else 'above'} {sl:.5g}, "
                        f"or if a {ctx.tf} {'bearish' if direction > 0 else 'bullish'} CHoCH prints before entry.",
    }
