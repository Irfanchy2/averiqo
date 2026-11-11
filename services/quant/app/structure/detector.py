"""Market-structure detection.

Design: `StructureAnalysis` scans the full candle history ONCE and records every event with the
bar index at which it became *knowable* (``confirmed_idx``) and the index at which its state
changed (mitigated / invalidated / consumed). ``snapshot(t)`` then reconstructs exactly what a
trader could have known at the close of bar ``t``. Live analysis is ``snapshot(n-1)``; the
backtester calls ``snapshot(t)`` for each bar. Because both paths share this code, backtests are
free of look-ahead bias and drawings never repaint (verified by tests/test_structure.py).

Liquidity note: "BSL"/"SSL" pools are *inferred* from swing points where stop orders commonly
rest. They are NOT observed exchange order-book liquidity, and are labelled ``inferred=True``.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from app.core.types import TIMEFRAMES, Candles
from app.indicators.core import atr as _atr
from app.indicators.core import sma

Dir = Literal["bullish", "bearish"]
NEVER = 10**12


@dataclass
class Swing:
    idx: int
    confirmed_idx: int
    price: float
    kind: Literal["high", "low"]
    label: str | None = None  # HH / LH / HL / LL
    consumed_idx: int = NEVER  # first bar that traded beyond this level


@dataclass
class Break:
    idx: int
    kind: Literal["BOS", "CHoCH"]
    direction: Dir
    level: float
    swing_idx: int
    displacement_atr: float


@dataclass
class FVG:
    idx: int  # third candle; confirmed at its close
    top: float
    bottom: float
    direction: Dir
    size_atr: float
    touched_idx: int = NEVER
    filled_idx: int = NEVER


@dataclass
class OrderBlock:
    candle_idx: int
    created_idx: int  # the structure break that validated it
    top: float
    bottom: float
    direction: Dir
    break_kind: str
    displacement_atr: float
    with_fvg: bool
    touched_idx: int = NEVER
    invalidated_idx: int = NEVER


@dataclass
class SDZone:
    base_start: int
    base_end: int
    created_idx: int
    top: float
    bottom: float
    kind: Literal["demand", "supply"]
    impulse_atr: float
    touched_idx: int = NEVER
    invalidated_idx: int = NEVER


@dataclass
class Sweep:
    idx: int
    level: float
    direction: Dir  # bullish = sell-side liquidity swept below and reclaimed
    swing_idx: int
    wick_atr: float


@dataclass
class Breakout:
    idx: int
    level: float
    direction: Dir
    volume_ratio: float
    failed_idx: int = NEVER


@dataclass
class Snapshot:
    t: int
    trend: int  # +1 bullish, -1 bearish, 0 undefined
    swings: list[Swing]
    breaks: list[Break]
    fvgs: list[FVG]
    order_blocks: list[OrderBlock]
    sd_zones: list[SDZone]
    sweeps: list[Sweep]
    breakouts: list[Breakout]
    sr_zones: list[dict] = field(default_factory=list)
    equal_levels: list[dict] = field(default_factory=list)
    liquidity: list[dict] = field(default_factory=list)
    trendlines: list[dict] = field(default_factory=list)
    fib: dict | None = None
    key_levels: list[dict] = field(default_factory=list)
    sessions: list[dict] = field(default_factory=list)


class StructureAnalysis:
    def __init__(self, c: Candles, timeframe: str, swing_k: int = 3):
        if len(c) < 2 * swing_k + 20:
            raise ValueError("not enough candles for structure analysis")
        self.c = c
        self.tf = timeframe
        self.tf_s = TIMEFRAMES[timeframe]
        self.k = swing_k
        self.n = len(c)
        a = _atr(c, 14)
        # fall back to rolling range before ATR warms up
        self.atr = np.where(np.isnan(a), np.maximum(c.high - c.low, 1e-12), a)
        self.vol_avg = sma(c.volume, 20)
        self.swings: list[Swing] = []
        self.breaks: list[Break] = []
        self.fvgs: list[FVG] = []
        self.obs: list[OrderBlock] = []
        self.sd: list[SDZone] = []
        self.sweeps: list[Sweep] = []
        self.breakouts: list[Breakout] = []
        self.trend_at = np.zeros(self.n, dtype=int)
        self._detect_swings()
        self._scan()
        self._detect_fvgs()
        self._detect_sd_zones()

    # ------------------------------------------------------------------ detection passes
    def _detect_swings(self) -> None:
        c, k = self.c, self.k
        last_h = last_l = None
        for i in range(k, self.n - k):
            h, lo = c.high[i], c.low[i]
            if h > c.high[i - k:i].max() and h >= c.high[i + 1:i + k + 1].max():
                lab = None if last_h is None else ("HH" if h > last_h else "LH")
                self.swings.append(Swing(i, i + k, float(h), "high", lab))
                last_h = h
            if lo < c.low[i - k:i].min() and lo <= c.low[i + 1:i + k + 1].min():
                lab = None if last_l is None else ("HL" if lo > last_l else "LL")
                self.swings.append(Swing(i, i + k, float(lo), "low", lab))
                last_l = lo
        self.swings.sort(key=lambda s: (s.confirmed_idx, s.idx))
        # consumption: first bar after confirmation trading beyond the level
        for s in self.swings:
            rng = slice(s.idx + 1, self.n)
            hits = np.flatnonzero(c.high[rng] > s.price) if s.kind == "high" else np.flatnonzero(c.low[rng] < s.price)
            if len(hits):
                s.consumed_idx = s.idx + 1 + int(hits[0])

    def _scan(self) -> None:
        """Bar-by-bar pass: BOS/CHoCH, order blocks, sweeps, breakouts (strictly causal)."""
        c = self.c
        trend = 0
        active_high: Swing | None = None
        active_low: Swing | None = None
        recent_low_idx = recent_high_idx = 0
        si = 0
        pending_breakouts: list[Breakout] = []
        for i in range(self.n):
            while si < len(self.swings) and self.swings[si].confirmed_idx <= i:
                s = self.swings[si]
                if s.kind == "high":
                    active_high = s
                    recent_high_idx = s.idx
                else:
                    active_low = s
                    recent_low_idx = s.idx
                si += 1
            a = self.atr[i]
            vr = float(c.volume[i] / self.vol_avg[i]) if not np.isnan(self.vol_avg[i]) and self.vol_avg[i] > 0 else 1.0

            # failed breakouts: price closes back through the broken level within 3 bars
            for b in pending_breakouts:
                if b.failed_idx == NEVER and i - b.idx <= 3:
                    if (b.direction == "bullish" and c.close[i] < b.level) or (b.direction == "bearish" and c.close[i] > b.level):
                        b.failed_idx = i
            pending_breakouts = [b for b in pending_breakouts if i - b.idx < 3 and b.failed_idx == NEVER]

            if active_high is not None and active_high.idx < i:
                if c.close[i] > active_high.price:
                    kind = "CHoCH" if trend == -1 else "BOS"
                    disp = float((c.close[i] - c.open[i]) / a) if a > 0 else 0.0
                    self.breaks.append(Break(i, kind, "bullish", active_high.price, active_high.idx, disp))
                    self._make_ob(i, recent_high_idx, "bullish", kind, disp)
                    bo = Breakout(i, active_high.price, "bullish", vr)
                    self.breakouts.append(bo)
                    pending_breakouts.append(bo)
                    trend = 1
                    active_high = None
                elif c.high[i] > active_high.price and c.close[i] < active_high.price:
                    self.sweeps.append(Sweep(i, active_high.price, "bearish", active_high.idx,
                                             float((c.high[i] - active_high.price) / a)))
                    active_high = None  # liquidity taken
            if active_low is not None and active_low.idx < i:
                if c.close[i] < active_low.price:
                    kind = "CHoCH" if trend == 1 else "BOS"
                    disp = float((c.open[i] - c.close[i]) / a) if a > 0 else 0.0
                    self.breaks.append(Break(i, kind, "bearish", active_low.price, active_low.idx, disp))
                    self._make_ob(i, recent_low_idx, "bearish", kind, disp)
                    bo = Breakout(i, active_low.price, "bearish", vr)
                    self.breakouts.append(bo)
                    pending_breakouts.append(bo)
                    trend = -1
                    active_low = None
                elif c.low[i] < active_low.price and c.close[i] > active_low.price:
                    self.sweeps.append(Sweep(i, active_low.price, "bullish", active_low.idx,
                                             float((active_low.price - c.low[i]) / a)))
                    active_low = None
            self.trend_at[i] = trend

    def _make_ob(self, b: int, swing_idx: int, direction: Dir, kind: str, disp: float) -> None:
        c = self.c
        lo_b = max(0, swing_idx - 2 * self.k)
        if direction == "bullish":
            m = lo_b + int(np.argmin(c.low[lo_b:b + 1]))
            cand = [j for j in range(m, max(m - 10, -1), -1) if c.close[j] < c.open[j]]
        else:
            m = lo_b + int(np.argmax(c.high[lo_b:b + 1]))
            cand = [j for j in range(m, max(m - 10, -1), -1) if c.close[j] > c.open[j]]
        if not cand:
            return
        j = cand[0]
        top, bot = float(c.high[j]), float(c.low[j])
        with_fvg = any(
            (c.low[x] > c.high[x - 2]) if direction == "bullish" else (c.high[x] < c.low[x - 2])
            for x in range(j + 2, b + 1)
        )
        ob = OrderBlock(j, b, top, bot, direction, kind, disp, with_fvg)
        after = slice(b + 1, self.n)
        if direction == "bullish":
            t = np.flatnonzero(c.low[after] <= top)
            inv = np.flatnonzero(c.close[after] < bot)
        else:
            t = np.flatnonzero(c.high[after] >= bot)
            inv = np.flatnonzero(c.close[after] > top)
        if len(t):
            ob.touched_idx = b + 1 + int(t[0])
        if len(inv):
            ob.invalidated_idx = b + 1 + int(inv[0])
        self.obs.append(ob)

    def _detect_fvgs(self) -> None:
        c = self.c
        for i in range(2, self.n):
            a = self.atr[i]
            if c.low[i] > c.high[i - 2]:
                f = FVG(i, float(c.low[i]), float(c.high[i - 2]), "bullish", float((c.low[i] - c.high[i - 2]) / a))
            elif c.high[i] < c.low[i - 2]:
                f = FVG(i, float(c.low[i - 2]), float(c.high[i]), "bearish", float((c.low[i - 2] - c.high[i]) / a))
            else:
                continue
            if f.size_atr < 0.15:
                continue
            after = slice(i + 1, self.n)
            if f.direction == "bullish":
                t, fl = np.flatnonzero(c.low[after] <= f.top), np.flatnonzero(c.low[after] <= f.bottom)
            else:
                t, fl = np.flatnonzero(c.high[after] >= f.bottom), np.flatnonzero(c.high[after] >= f.top)
            if len(t):
                f.touched_idx = i + 1 + int(t[0])
            if len(fl):
                f.filled_idx = i + 1 + int(fl[0])
            self.fvgs.append(f)

    def _detect_sd_zones(self) -> None:
        """Supply/demand: a tight base (1-3 small bars) followed by a 3-bar impulse > 2 ATR."""
        c = self.c
        i = 5
        while i < self.n:
            a = self.atr[i]
            move = c.close[i] - c.open[i - 2]
            if abs(move) > 2.0 * a and np.all(np.sign(c.close[i - 2:i + 1] - c.open[i - 2:i + 1]) == np.sign(move)):
                base_end = i - 3
                base_start = base_end
                while base_start > max(0, base_end - 2) and (c.high[base_start - 1] - c.low[base_start - 1]) < 0.8 * a:
                    base_start -= 1
                if (c.high[base_end] - c.low[base_end]) < 1.0 * a:
                    top = float(c.high[base_start:base_end + 1].max())
                    bot = float(c.low[base_start:base_end + 1].min())
                    kind = "demand" if move > 0 else "supply"
                    z = SDZone(base_start, base_end, i, top, bot, kind, float(abs(move) / a))
                    after = slice(i + 1, self.n)
                    if kind == "demand":
                        t, inv = np.flatnonzero(c.low[after] <= top), np.flatnonzero(c.close[after] < bot)
                    else:
                        t, inv = np.flatnonzero(c.high[after] >= bot), np.flatnonzero(c.close[after] > top)
                    if len(t):
                        z.touched_idx = i + 1 + int(t[0])
                    if len(inv):
                        z.invalidated_idx = i + 1 + int(inv[0])
                    self.sd.append(z)
                    i += 3
                    continue
            i += 1

    # ------------------------------------------------------------------ point-in-time view
    def snapshot(self, t: int | None = None, lookback: int = 300, full: bool = True) -> Snapshot:
        t = self.n - 1 if t is None else t
        lo = max(0, t - lookback)
        sw = [s for s in self.swings if s.confirmed_idx <= t and s.idx >= lo]
        snap = Snapshot(
            t=t,
            trend=int(self.trend_at[t]),
            swings=sw,
            breaks=[b for b in self.breaks if lo <= b.idx <= t],
            fvgs=[f for f in self.fvgs if lo <= f.idx <= t and f.filled_idx > t],
            order_blocks=[o for o in self.obs if lo <= o.created_idx <= t and o.invalidated_idx > t],
            sd_zones=[z for z in self.sd if lo <= z.created_idx <= t and z.invalidated_idx > t],
            sweeps=[s for s in self.sweeps if lo <= s.idx <= t],
            breakouts=[b for b in self.breakouts if lo <= b.idx <= t],
        )
        if full:
            snap.sr_zones = self._sr_zones(sw, t)
            snap.equal_levels, snap.liquidity = self._liquidity(sw, t)
            snap.trendlines = self._trendlines(sw, t)
            snap.fib = self._fib(sw, t)
            snap.key_levels = self._key_levels(t)
            snap.sessions = self._sessions(t)
        return snap

    def _sr_zones(self, sw: list[Swing], t: int) -> list[dict]:
        a = self.atr[t]
        tol = 0.5 * a
        pts = sorted(sw, key=lambda s: s.price)
        clusters: list[list[Swing]] = []
        for s in pts:
            if clusters and s.price - clusters[-1][-1].price <= tol:
                clusters[-1].append(s)
            else:
                clusters.append([s])
        price = self.c.close[t]
        out = []
        for cl in clusters:
            if len(cl) < 2:
                continue
            top = max(s.price for s in cl) + 0.1 * a
            bot = min(s.price for s in cl) - 0.1 * a
            # a zone that price closed through and stayed beyond flips role; we just classify vs price
            role = "resistance" if bot > price else "support" if top < price else "inside"
            recency = 1 - (t - max(s.idx for s in cl)) / max(1, t - (t - 300))
            quality = min(100, int(25 * len(cl) + 30 * max(0.0, recency)))
            out.append({
                "top": float(top), "bottom": float(bot), "role": role, "touches": len(cl),
                "first_idx": min(s.idx for s in cl), "last_idx": max(s.idx for s in cl),
                "confirmed_idx": max(s.confirmed_idx for s in cl), "quality": quality,
            })
        return out

    def _liquidity(self, sw: list[Swing], t: int) -> tuple[list[dict], list[dict]]:
        a = self.atr[t]
        live_h = [s for s in sw if s.kind == "high" and s.consumed_idx > t]
        live_l = [s for s in sw if s.kind == "low" and s.consumed_idx > t]
        eq: list[dict] = []
        for group, kind in ((live_h, "EQH"), (live_l, "EQL")):
            g = sorted(group, key=lambda s: s.idx)
            for i in range(len(g)):
                for j in range(i + 1, len(g)):
                    if abs(g[i].price - g[j].price) <= 0.15 * a and g[j].idx - g[i].idx >= 2 * self.k:
                        eq.append({"kind": kind, "price": float(max(g[i].price, g[j].price) if kind == "EQH" else min(g[i].price, g[j].price)),
                                   "idx_a": g[i].idx, "idx_b": g[j].idx, "confirmed_idx": g[j].confirmed_idx})
        liq = []
        for s in live_h:
            liq.append({"side": "BSL", "price": s.price, "idx": s.idx, "confirmed_idx": s.confirmed_idx,
                        "equal": any(e["kind"] == "EQH" and s.idx in (e["idx_a"], e["idx_b"]) for e in eq)})
        for s in live_l:
            liq.append({"side": "SSL", "price": s.price, "idx": s.idx, "confirmed_idx": s.confirmed_idx,
                        "equal": any(e["kind"] == "EQL" and s.idx in (e["idx_a"], e["idx_b"]) for e in eq)})
        return eq, liq

    def _trendlines(self, sw: list[Swing], t: int) -> list[dict]:
        c, a = self.c, self.atr[t]
        out = []
        for kind, direction in (("low", "ascending"), ("high", "descending")):
            pts = [s for s in sw if s.kind == kind]
            if len(pts) < 2:
                continue
            p1, p2 = pts[-2], pts[-1]
            if (kind == "low" and p2.price <= p1.price) or (kind == "high" and p2.price >= p1.price):
                continue
            slope = (p2.price - p1.price) / (p2.idx - p1.idx)
            xs = np.arange(p1.idx, t + 1)
            line = p1.price + slope * (xs - p1.idx)
            closes = c.close[p1.idx:t + 1]
            violated = bool(np.any(closes < line - 0.1 * a)) if kind == "low" else bool(np.any(closes > line + 0.1 * a))
            touches = sum(1 for s in pts if s.idx >= p1.idx and abs(s.price - (p1.price + slope * (s.idx - p1.idx))) <= 0.25 * a)
            # opposite rail for a channel: parallel through the extreme between anchors
            seg = slice(p1.idx, p2.idx + 1)
            if kind == "low":
                j = p1.idx + int(np.argmax(c.high[seg])); off = c.high[j] - (p1.price + slope * (j - p1.idx))
            else:
                j = p1.idx + int(np.argmin(c.low[seg])); off = c.low[j] - (p1.price + slope * (j - p1.idx))
            out.append({
                "direction": direction, "kind": kind, "p1": (p1.idx, p1.price), "p2": (p2.idx, p2.price),
                "slope": float(slope), "value_at_t": float(line[-1]), "violated": violated, "touches": touches,
                "channel_offset": float(off), "confirmed_idx": p2.confirmed_idx,
            })
        return out

    def _fib(self, sw: list[Swing], t: int) -> dict | None:
        highs = [s for s in sw if s.kind == "high"]
        lows = [s for s in sw if s.kind == "low"]
        if not highs or not lows:
            return None
        # dealing range: most extreme swing high/low over the recent window
        h = max(highs[-8:], key=lambda s: s.price)
        lo = min(lows[-8:], key=lambda s: s.price)
        up = lo.idx < h.idx  # leg from low to high = bullish impulse, retracement measured downward
        rng = h.price - lo.price
        if rng <= 0:
            return None
        ratios = [0.0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0]
        levels = [{"ratio": r, "price": float(h.price - r * rng if up else lo.price + r * rng)} for r in ratios]
        eq = (h.price + lo.price) / 2
        price = self.c.close[t]
        return {"direction": "bullish" if up else "bearish", "high": (h.idx, h.price), "low": (lo.idx, lo.price),
                "levels": levels, "equilibrium": float(eq),
                "zone": "premium" if price > eq else "discount", "confirmed_idx": max(h.confirmed_idx, lo.confirmed_idx)}

    def _key_levels(self, t: int) -> list[dict]:
        c = self.c
        out = []
        day = c.time[: t + 1] // 86400
        week = (c.time[: t + 1] // 86400 + 3) // 7  # weeks start Monday
        for name, key, span in (("PD", day, 86400), ("PW", week, 7 * 86400)):
            if self.tf_s >= span:
                if t >= 1:
                    out += [{"kind": f"{name}H", "price": float(c.high[t - 1]), "idx": t - 1},
                            {"kind": f"{name}L", "price": float(c.low[t - 1]), "idx": t - 1}]
                continue
            cur = key[t]
            prev_mask = key == cur - 1
            if prev_mask.any():
                idx = np.flatnonzero(prev_mask)
                out += [{"kind": f"{name}H", "price": float(c.high[idx].max()), "idx": int(idx[0])},
                        {"kind": f"{name}L", "price": float(c.low[idx].min()), "idx": int(idx[0])}]
        return out

    def _sessions(self, t: int) -> list[dict]:
        if self.tf_s > 3600:
            return []
        c = self.c
        day0 = (c.time[t] // 86400) * 86400
        out = []
        for name, h0, h1 in (("Asia", 0, 8), ("London", 7, 16), ("New York", 12, 21)):
            s, e = day0 + h0 * 3600, day0 + h1 * 3600
            m = (c.time[: t + 1] >= s) & (c.time[: t + 1] < e)
            if not m.any():  # session not started today yet: use yesterday's
                s, e = s - 86400, e - 86400
                m = (c.time[: t + 1] >= s) & (c.time[: t + 1] < e)
            if m.any():
                idx = np.flatnonzero(m)
                out.append({"session": name, "high": float(c.high[idx].max()), "low": float(c.low[idx].min()),
                            "start": int(s), "end": int(e), "complete": bool(c.time[t] + self.tf_s >= e)})
        return out


# ---------------------------------------------------------------------------- drawing export

def _id(*parts) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:12]


def build_drawings(sa: StructureAnalysis, snap: Snapshot, symbol: str) -> list[dict]:
    """Convert a snapshot into chart drawings. Every drawing carries label, price, timeframe,
    detection timestamp, reason, a heuristic quality score (0-100; NOT a probability), and
    invalidation conditions."""
    c, tf, tfs = sa.c, sa.tf, sa.tf_s
    t = snap.t

    def ts(i: int) -> int:
        return int(c.time[min(max(i, 0), sa.n - 1)])

    def detected(i: int) -> int:  # bar close time of the confirming bar
        return ts(i) + tfs

    def fmt(p: float) -> str:
        return f"{p:,.5f}" if p < 10 else f"{p:,.2f}"

    D: list[dict] = []

    def add(kind, label, reason, quality, invalidation, *, price=None, top=None, bottom=None, start=None,
            end=None, points=None, direction=None, inferred=False, status="active", confirmed_idx=t, extra=None):
        d = {
            "id": _id(symbol, tf, kind, label, start, price, top, bottom),
            "kind": kind, "label": label, "symbol": symbol, "timeframe": tf,
            "price": price, "top": top, "bottom": bottom,
            "time_start": start, "time_end": end, "points": points,
            "direction": direction, "detected_at": detected(confirmed_idx),
            "reason": reason, "quality": int(max(0, min(100, quality))),
            "invalidation": invalidation, "status": status, "inferred": inferred,
        }
        if extra:
            d.update(extra)
        D.append(d)

    # swings (last 12) as labelled points
    for s in snap.swings[-12:]:
        if not s.label:
            continue
        add("swing", s.label, f"{s.kind.title()} pivot confirmed by {sa.k} bars on each side; "
            f"{'higher' if s.label in ('HH', 'HL') else 'lower'} than the previous swing {s.kind}.",
            60, f"Label is final once confirmed; the level is consumed if price trades {'above' if s.kind == 'high' else 'below'} {fmt(s.price)}.",
            price=s.price, start=ts(s.idx), points=[{"time": ts(s.idx), "price": s.price}],
            direction="bullish" if s.label in ("HH", "HL") else "bearish", confirmed_idx=s.confirmed_idx,
            extra={"position": "above" if s.kind == "high" else "below"})

    for b in snap.breaks[-6:]:
        q = 40 + min(40, b.displacement_atr * 20) + (10 if b.kind == "CHoCH" else 0)
        add("structure_break", b.kind, f"Candle closed {'above' if b.direction == 'bullish' else 'below'} the swing "
            f"{'high' if b.direction == 'bullish' else 'low'} at {fmt(b.level)} with {b.displacement_atr:.1f}× ATR body"
            + (" — first break against the prior trend (change of character)." if b.kind == "CHoCH" else " — continuation of the trend."),
            q, f"Weakens if price closes back {'below' if b.direction == 'bullish' else 'above'} {fmt(b.level)}.",
            price=b.level, start=ts(b.swing_idx), end=ts(b.idx), direction=b.direction, confirmed_idx=b.idx)

    for o in snap.order_blocks[-6:]:
        q = 35 + min(30, o.displacement_atr * 15) + (15 if o.with_fvg else 0) + (10 if o.break_kind == "CHoCH" else 0) \
            + (10 if o.touched_idx > t else 0)
        side = "Bullish" if o.direction == "bullish" else "Bearish"
        add("order_block", f"{side} OB", f"Last {'down' if o.direction == 'bullish' else 'up'}-close candle before the "
            f"displacement that caused a {o.break_kind}." + (" Impulse left a fair value gap." if o.with_fvg else "")
            + (" Untested." if o.touched_idx > t else " Already tested once."),
            q, f"Invalid on a candle close {'below' if o.direction == 'bullish' else 'above'} "
            f"{fmt(o.bottom if o.direction == 'bullish' else o.top)}.",
            top=o.top, bottom=o.bottom, start=ts(o.candle_idx), direction=o.direction, confirmed_idx=o.created_idx,
            status="tested" if o.touched_idx <= t else "active")

    for f in snap.fvgs[-8:]:
        add("fvg", f"{'Bullish' if f.direction == 'bullish' else 'Bearish'} FVG",
            f"Three-candle imbalance: candle 3 {'low' if f.direction == 'bullish' else 'high'} does not overlap candle 1 "
            f"{'high' if f.direction == 'bullish' else 'low'} (gap {f.size_atr:.2f}× ATR).",
            30 + min(50, f.size_atr * 40) + (10 if f.touched_idx > t else 0),
            "Considered filled when price trades through the full gap.",
            top=f.top, bottom=f.bottom, start=ts(f.idx - 1), direction=f.direction, confirmed_idx=f.idx,
            status="partially_filled" if f.touched_idx <= t else "active")

    for z in snap.sd_zones[-6:]:
        add(z.kind, f"{z.kind.title()} zone", f"Tight base of {z.base_end - z.base_start + 1} bar(s) followed by a "
            f"{z.impulse_atr:.1f}× ATR impulse {'up' if z.kind == 'demand' else 'down'}.",
            30 + min(40, z.impulse_atr * 10) + (20 if z.touched_idx > t else 0),
            f"Invalid on a close {'below' if z.kind == 'demand' else 'above'} {fmt(z.bottom if z.kind == 'demand' else z.top)}.",
            top=z.top, bottom=z.bottom, start=ts(z.base_start), direction="bullish" if z.kind == "demand" else "bearish",
            confirmed_idx=z.created_idx, status="tested" if z.touched_idx <= t else "fresh")

    price = c.close[t]
    for z in sorted(snap.sr_zones, key=lambda z: abs((z["top"] + z["bottom"]) / 2 - price))[:6]:
        add("sr_zone", z["role"].title(), f"{z['touches']} swing points clustered within 0.5× ATR.", z["quality"],
            f"Broken on a decisive close beyond the zone ({'below' if z['role'] == 'support' else 'above'}).",
            top=z["top"], bottom=z["bottom"], start=ts(z["first_idx"]), confirmed_idx=z["confirmed_idx"],
            extra={"role": z["role"], "touches": z["touches"]})

    for s in snap.sweeps[-5:]:
        add("liquidity_sweep", "SSL sweep" if s.direction == "bullish" else "BSL sweep",
            f"Wick traded {s.wick_atr:.2f}× ATR beyond the swing {'low' if s.direction == 'bullish' else 'high'} at "
            f"{fmt(s.level)} and closed back inside — stops beyond the level were likely triggered (inferred).",
            40 + min(40, s.wick_atr * 40), f"Fails if price closes {'below' if s.direction == 'bullish' else 'above'} the sweep extreme.",
            price=s.level, start=ts(s.swing_idx), end=ts(s.idx), direction=s.direction, inferred=True, confirmed_idx=s.idx)

    for b in snap.breakouts[-4:]:
        failed = b.failed_idx <= t
        add("breakout", "Failed breakout" if failed else "Breakout",
            f"Close beyond {fmt(b.level)} on {b.volume_ratio:.1f}× average volume" +
            (", then closed back inside within 3 bars." if failed else "."),
            (35 + min(30, b.volume_ratio * 15)) if not failed else 55,
            "A breakout fails if price closes back through the level within 3 bars.",
            price=b.level, start=ts(b.idx), direction=b.direction if not failed else ("bearish" if b.direction == "bullish" else "bullish"),
            confirmed_idx=b.failed_idx if failed else b.idx, status="failed" if failed else "active")

    for liq in sorted(snap.liquidity, key=lambda x: abs(x["price"] - price))[:6]:
        add("liquidity", liq["side"] + (" (equal)" if liq["equal"] else ""),
            f"Untaken swing {'high' if liq['side'] == 'BSL' else 'low'}; stop orders are commonly placed beyond such levels. "
            "INFERRED from price structure — not observed order-book liquidity.",
            45 + (25 if liq["equal"] else 0), "Removed once price trades through the level.",
            price=liq["price"], start=ts(liq["idx"]), inferred=True, confirmed_idx=liq["confirmed_idx"],
            direction="bearish" if liq["side"] == "BSL" else "bullish")

    for tl in snap.trendlines:
        i1, y1 = tl["p1"]
        pts = [{"time": ts(i1), "price": y1}, {"time": ts(t), "price": tl["value_at_t"]}]
        add("trendline", f"{tl['direction'].title()} trendline", f"Connects the last two {'higher lows' if tl['kind'] == 'low' else 'lower highs'}; "
            f"{tl['touches']} touch(es).", 30 + 15 * tl["touches"] - (30 if tl["violated"] else 0),
            f"Broken on a close {'below' if tl['kind'] == 'low' else 'above'} the line.",
            points=pts, start=ts(i1), direction="bullish" if tl["kind"] == "low" else "bearish",
            confirmed_idx=tl["confirmed_idx"], status="broken" if tl["violated"] else "active")
        off = tl["channel_offset"]
        add("channel", "Channel rail", "Parallel to the trendline through the opposite extreme between its anchors.",
            25 + 10 * tl["touches"], "Channel invalid when the main trendline breaks.",
            points=[{"time": p["time"], "price": p["price"] + off} for p in pts], start=ts(i1),
            confirmed_idx=tl["confirmed_idx"], status="broken" if tl["violated"] else "active")

    if snap.fib:
        f = snap.fib
        add("fibonacci", f"Fib {f['direction']} leg", f"Retracement of the dealing range {fmt(f['low'][1])} – {fmt(f['high'][1])}. "
            f"Price is in the {f['zone']} half (equilibrium {fmt(f['equilibrium'])}).", 50,
            "Re-anchored when a new swing extreme forms.", top=f["high"][1], bottom=f["low"][1],
            start=ts(min(f["high"][0], f["low"][0])), direction=f["direction"], confirmed_idx=f["confirmed_idx"],
            extra={"levels": f["levels"], "zone": f["zone"]})

    for k in snap.key_levels:
        names = {"PDH": "Previous day high", "PDL": "Previous day low", "PWH": "Previous week high", "PWL": "Previous week low"}
        add("key_level", k["kind"], f"{names[k['kind']]} (UTC calendar).", 55, "Reference level; no invalidation.",
            price=k["price"], start=ts(k["idx"]))

    for s in snap.sessions:
        for side in ("high", "low"):
            add("session_level", f"{s['session']} {side}", f"{s['session']} session (UTC) {side}"
                + ("" if s["complete"] else " — session still in progress, level may extend."), 40,
                "Reference level; updates while the session is open.", price=s[side], start=s["start"], end=s["end"],
                status="active" if s["complete"] else "developing")
    return D
