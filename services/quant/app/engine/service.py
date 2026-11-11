"""Analysis orchestration + caching. Recomputes only when a new candle closes."""
from __future__ import annotations

import threading
import time

import numpy as np

from app.backtest.engine import BacktestConfig, run_backtest
from app.core.types import HTF_MAP, TIMEFRAMES
from app.data.instruments import get_instrument
from app.data.providers import MarketDataProvider
from app.engine.decision import MarketContext, StrategyParams, evaluate
from app.news.calendar import blackout_status, get_calendar
from app.structure.detector import build_drawings

LTF_BARS = 1000
HTF_BARS = 600
CAL_TTL = 3600


class AnalysisService:
    def __init__(self, provider: MarketDataProvider):
        self.p = provider
        self._ctx: dict[tuple, tuple[int, MarketContext]] = {}
        self._cal: dict[tuple, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def context(self, symbol: str, tf: str) -> MarketContext:
        inst = get_instrument(symbol)
        ltf = self.p.closed_candles(inst.symbol, tf, LTF_BARS)
        key = (inst.symbol, tf)
        with self._lock:
            hit = self._ctx.get(key)
            if hit and hit[0] == int(ltf.time[-1]) and len(hit[1].c) == len(ltf):
                return hit[1]
        htf_tf = HTF_MAP[tf]
        htf = self.p.closed_candles(inst.symbol, htf_tf, HTF_BARS) if htf_tf != tf else ltf
        ctx = MarketContext(inst, tf, ltf, htf)
        with self._lock:
            self._ctx[key] = (int(ltf.time[-1]), ctx)
        return ctx

    def calibration(self, ctx: MarketContext, params: StrategyParams) -> dict:
        key = (ctx.inst.symbol, ctx.tf, tuple(sorted(params.to_dict().items())))
        hit = self._cal.get(key)
        if hit and time.time() - hit[0] < CAL_TTL:
            return hit[1]
        res = run_backtest(ctx, params, BacktestConfig(), simulated_data=self.p.is_simulated)
        out = {"table": res["calibration"], "trades": res["metrics"]["trades"], "period": res["period"],
               "simulated_data": self.p.is_simulated}
        self._cal[key] = (time.time(), out)
        return out

    def setup(self, symbol: str, tf: str, params: StrategyParams, equity: float | None = None,
              risk_pct: float = 1.0, blackout_before: int = 30, blackout_after: int = 30) -> dict:
        ctx = self.context(symbol, tf)
        t = len(ctx.c) - 1
        q = self.p.quote(ctx.inst.symbol)
        now = self.p.now()
        events = get_calendar().events(int(now) - 86400, int(now) + 7 * 86400)
        bo = blackout_status(events, ctx.inst.symbol, now, blackout_before, blackout_after)
        # freshness: last closed bar must be the most recent one expected
        age = now - (ctx.c.time[-1] + TIMEFRAMES[tf])
        stale_s = max(0.0, age - TIMEFRAMES[tf])
        res = evaluate(ctx, t, params, spread=q.spread, quote_age_s=max(now - q.timestamp, stale_s),
                       news_blackout=bo, equity=equity, risk_pct=risk_pct)
        cal = self.calibration(ctx, params)
        bucket = next((r for r in cal["table"] if r["quality_range"][0] <= res["quality"] <= r["quality_range"][1]), None)
        if bucket and bucket["trades"] >= 30:
            res["confidence"] = {"calibrated": True, "historical_win_rate": bucket["win_rate"],
                                 "historical_expectancy_r": bucket["expectancy_r"], "sample_size": bucket["trades"],
                                 "note": "Measured by backtesting these exact rules on this symbol/timeframe history."}
        else:
            res["confidence"] = {"calibrated": False, "sample_size": bucket["trades"] if bucket else 0,
                                 "historical_win_rate": bucket["win_rate"] if bucket else None,
                                 "historical_expectancy_r": bucket["expectancy_r"] if bucket else None,
                                 "note": "Insufficient historical sample (<30 trades) in this quality range — no calibrated confidence is shown."}
        res["confidence"]["simulated_data"] = cal["simulated_data"]
        res["news"] = bo
        res["data_source"] = self.p.name
        res["simulated_data"] = self.p.is_simulated
        return res

    def analysis(self, symbol: str, tf: str) -> dict:
        ctx = self.context(symbol, tf)
        snap = ctx.sa.snapshot()
        drawings = build_drawings(ctx.sa, snap, ctx.inst.symbol)
        t = len(ctx.c) - 1
        ind = ctx.ind
        price = float(ctx.c.close[t])

        def last(a):
            v = a[t]
            return None if np.isnan(v) else float(v)

        res_z = sorted([z for z in snap.sr_zones if z["role"] == "resistance"], key=lambda z: z["bottom"])
        sup_z = sorted([z for z in snap.sr_zones if z["role"] == "support"], key=lambda z: -z["top"])
        return {
            "symbol": ctx.inst.symbol, "timeframe": tf, "htf": ctx.htf_tf, "bar_time": int(ctx.c.time[t]),
            "price": price, "trend": {1: "bullish", -1: "bearish", 0: "undefined"}[snap.trend],
            "htf_bias": ctx.htf_bias(t).__dict__,
            "drawings": drawings,
            "indicators": {k: last(getattr(ind, k)) for k in ("ema9", "ema21", "ema50", "ema200", "rsi", "macd",
                                                                "macd_signal", "macd_hist", "atr", "adx", "plus_di",
                                                                "minus_di", "vwap", "supertrend", "supertrend_dir")},
            "nearest_resistance": res_z[0] if res_z else None,
            "nearest_support": sup_z[0] if sup_z else None,
            "liquidity": snap.liquidity, "sweeps": [s.__dict__ for s in snap.sweeps[-10:]],
            "order_blocks": [o.__dict__ for o in snap.order_blocks[-10:]],
            "breaks": [b.__dict__ for b in snap.breaks[-10:]],
            "fib": snap.fib, "sessions": snap.sessions, "key_levels": snap.key_levels,
            "data_source": self.p.name, "simulated_data": self.p.is_simulated,
        }

    def mtf(self, symbol: str) -> list[dict]:
        out = []
        for tf in TIMEFRAMES:
            try:
                c = self.p.closed_candles(symbol, tf, 400)
                from app.indicators.core import IndicatorSet
                from app.structure.detector import StructureAnalysis
                sa = StructureAnalysis(c, tf)
                ind = IndicatorSet(c)
                t = len(c) - 1
                ema_al = None if np.isnan(ind.ema50[t]) else ("bullish" if ind.ema21[t] > ind.ema50[t] else "bearish")
                last_break = sa.breaks[-1] if sa.breaks else None
                out.append({"timeframe": tf, "trend": {1: "bullish", -1: "bearish", 0: "undefined"}[int(sa.trend_at[t])],
                            "ema_alignment": ema_al, "rsi": None if np.isnan(ind.rsi[t]) else round(float(ind.rsi[t]), 1),
                            "adx": None if np.isnan(ind.adx[t]) else round(float(ind.adx[t]), 1),
                            "last_break": None if not last_break else {"kind": last_break.kind, "direction": last_break.direction,
                                                                       "level": last_break.level, "bars_ago": t - last_break.idx}})
            except Exception as e:  # pragma: no cover - surfaced to UI
                out.append({"timeframe": tf, "error": str(e)})
        return out
