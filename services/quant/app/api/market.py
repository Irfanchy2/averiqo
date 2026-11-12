from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import analysis_service, get_db
from app.backtest.engine import (
    BacktestConfig,
    out_of_sample,
    run_backtest,
    walk_forward,
)
from app.core.jsonutil import clean
from app.core.types import HTF_MAP, TIMEFRAMES
from app.data.instruments import INSTRUMENTS, get_instrument
from app.data.providers import DataUnavailable, get_provider
from app.db.models import BacktestRun, Signal
from app.engine.decision import MarketContext, StrategyParams
from app.execution.state import ensure_user, risk_config, strategy_params
from app.indicators.core import INDICATOR_CATALOG, compute_indicator, volume_profile
from app.news.calendar import (
    EVENT_IMPACT_GUIDE,
    blackout_status,
    events_for_symbol,
    get_calendar,
    impact_explanation,
)

router = APIRouter(prefix="/api")


def _tf(tf: str) -> str:
    if tf not in TIMEFRAMES:
        raise HTTPException(400, f"timeframe must be one of {list(TIMEFRAMES)}")
    return tf


def _sym(symbol: str) -> str:
    try:
        return get_instrument(symbol).symbol
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@router.get("/health")
def health():
    p = get_provider()
    return {"status": "ok", "time": time.time(), "data_provider": p.name, "simulated_data": p.is_simulated}


@router.get("/instruments")
def instruments():
    return [i.to_dict() for i in INSTRUMENTS.values()]


@router.get("/timeframes")
def timeframes():
    return [{"key": k, "seconds": v, "htf": HTF_MAP[k]} for k, v in TIMEFRAMES.items()]


@router.get("/candles")
def candles(symbol: str, tf: str = "1h", limit: int = Query(500, ge=10, le=2000)):
    p = get_provider()
    try:
        c = p.candles(_sym(symbol), _tf(tf), limit)
    except DataUnavailable as e:
        raise HTTPException(503, str(e)) from e
    return {"symbol": symbol.upper(), "timeframe": tf, "source": p.name, "simulated": p.is_simulated,
            "last_bar_forming": bool(len(c) and c.time[-1] + TIMEFRAMES[tf] > p.now()),
            "candles": c.to_records()}


@router.get("/quote")
def quote(symbol: str):
    try:
        q = get_provider().quote(_sym(symbol))
    except DataUnavailable as e:
        raise HTTPException(503, str(e)) from e
    return {**q.to_dict(), "simulated": get_provider().is_simulated}


@router.get("/indicators/catalog")
def indicator_catalog():
    return INDICATOR_CATALOG


class IndicatorReq(BaseModel):
    symbol: str
    timeframe: str = "1h"
    limit: int = Field(500, ge=50, le=2000)
    indicators: list[dict] = Field(default_factory=lambda: [{"name": "ema", "params": {"period": 21}}])


@router.post("/indicators")
def indicators(req: IndicatorReq):
    c = get_provider().candles(_sym(req.symbol), _tf(req.timeframe), req.limit)
    out = {}
    for spec in req.indicators:
        try:
            for k, arr in compute_indicator(c, spec["name"], spec.get("params")).items():
                out[k] = [{"time": int(t), "value": v} for t, v in zip(c.time, clean(arr)) if v is not None]
        except KeyError as e:
            raise HTTPException(400, str(e)) from e
    return {"symbol": req.symbol, "timeframe": req.timeframe, "series": out, "volume_profile": clean(volume_profile(c))}


@router.get("/analysis")
def analysis(symbol: str, tf: str = "1h"):
    try:
        return clean(analysis_service().analysis(_sym(symbol), _tf(tf)))
    except DataUnavailable as e:
        raise HTTPException(503, str(e)) from e


@router.get("/mtf")
def mtf(symbol: str):
    return clean(analysis_service().mtf(_sym(symbol)))


@router.get("/setup")
def setup(symbol: str, tf: str = "1h", db: Session = Depends(get_db)):
    from app.api.deps import paper_broker
    _, st, acct = ensure_user(db)
    cfg = risk_config(st)
    equity = paper_broker().summary(db, acct, st)["equity"]
    try:
        res = analysis_service().setup(_sym(symbol), _tf(tf), strategy_params(st), equity=equity,
                                       risk_pct=cfg.max_risk_per_trade_pct, blackout_before=cfg.news_blackout_before_min,
                                       blackout_after=cfg.news_blackout_after_min)
    except DataUnavailable as e:
        raise HTTPException(503, str(e)) from e
    res = clean(res)
    _store_signal(db, res)
    return res


def _store_signal(db: Session, res: dict) -> None:
    exists = db.execute(select(Signal).where(Signal.symbol == res["symbol"], Signal.timeframe == res["timeframe"],
                                             Signal.bar_time == res["bar_time"])).scalar_one_or_none()
    if exists is None:
        # concurrent /scan and /setup requests may race to insert the same bar's signal:
        # a savepoint lets the loser roll back just this insert instead of failing the request
        try:
            with db.begin_nested():
                db.add(Signal(symbol=res["symbol"], timeframe=res["timeframe"], status=res["status"], direction=res["direction"],
                              quality=res["quality"], bar_time=res["bar_time"], payload=res))
        except IntegrityError:
            pass


@router.get("/signals")
def signals(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.execute(select(Signal).order_by(Signal.id.desc()).limit(limit)).scalars()
    return [{"id": s.id, "symbol": s.symbol, "timeframe": s.timeframe, "status": s.status, "direction": s.direction,
             "quality": s.quality, "bar_time": s.bar_time, "created_at": s.created_at.isoformat(),
             "plan": (s.payload or {}).get("plan")} for s in rows]


@router.get("/scan")
def scan(tf: str = "1h", db: Session = Depends(get_db)):
    """Evaluate the decision engine across the whole watchlist."""
    _, st, _ = ensure_user(db)
    svc, out = analysis_service(), []
    for sym in INSTRUMENTS:
        try:
            r = clean(svc.setup(sym, _tf(tf), strategy_params(st)))
            _store_signal(db, r)
            out.append({k: r[k] for k in ("symbol", "timeframe", "status", "direction", "quality", "price", "missing")})
        except DataUnavailable as e:
            out.append({"symbol": sym, "timeframe": tf, "status": "data_unavailable", "error": str(e)})
    return out


# ------------------------------------------------------------------ news
@router.get("/news/calendar")
def calendar(hours_back: int = 24, hours_ahead: int = 168, symbol: str | None = None):
    now = get_provider().now()
    cal = get_calendar()
    evs = cal.events(int(now - hours_back * 3600), int(now + hours_ahead * 3600))
    if symbol:
        evs = events_for_symbol(evs, _sym(symbol))
    rows = []
    for e in evs:
        d = e.to_dict()
        d["impact"] = {k: impact_explanation(e, s) for k, s in
                       (("BTC", "BTCUSDT"), ("GOLD", "XAUUSD"), ("OIL", "USOIL"), ("FX", "EURUSD"))}
        rows.append(d)
    return {"provider": cal.name, "now": now, "is_simulated": True if cal.name == "demo_schedule" else False,
            "disclaimer": "DEMO schedule: approximate recurring dates, no actual/forecast values. Configure a licensed calendar provider for production.",
            "events": rows}


@router.get("/news/blackout")
def blackout(symbol: str, db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    cfg = risk_config(st)
    now = get_provider().now()
    evs = get_calendar().events(int(now) - 86400, int(now) + 7 * 86400)
    return blackout_status(evs, _sym(symbol), now, cfg.news_blackout_before_min, cfg.news_blackout_after_min)


@router.get("/news/impact-guide")
def impact_guide():
    return EVENT_IMPACT_GUIDE


# ------------------------------------------------------------------ backtesting
class BacktestReq(BaseModel):
    symbol: str = "BTCUSDT"
    timeframe: str = "1h"
    bars: int = Field(2000, ge=400, le=5000)
    params: dict = Field(default_factory=dict)
    initial_equity: float = 10_000
    risk_pct: float = Field(1.0, gt=0, le=5)
    mode: str = Field("single", pattern="^(single|oos|walk_forward)$")
    folds: int = Field(4, ge=2, le=8)


@router.post("/backtest")
def backtest(req: BacktestReq, db: Session = Depends(get_db)):
    p = get_provider()
    sym, tf = _sym(req.symbol), _tf(req.timeframe)
    try:
        ltf = p.closed_candles(sym, tf, req.bars)
        htf = p.closed_candles(sym, HTF_MAP[tf], max(300, req.bars * TIMEFRAMES[tf] // TIMEFRAMES[HTF_MAP[tf]] + 250))
    except DataUnavailable as e:
        raise HTTPException(503, str(e)) from e
    ctx = MarketContext(get_instrument(sym), tf, ltf, htf)
    params = StrategyParams.from_dict(req.params)
    cfg = BacktestConfig(initial_equity=req.initial_equity, risk_pct=req.risk_pct)
    res = run_backtest(ctx, params, cfg, simulated_data=p.is_simulated)
    if req.mode == "oos":
        res["out_of_sample"] = out_of_sample(ctx, params, cfg)
    elif req.mode == "walk_forward":
        res["walk_forward"] = walk_forward(ctx, params, cfg, folds=req.folds)
    res["data_source"] = p.name
    res = clean(res)
    db.add(BacktestRun(symbol=sym, timeframe=tf, params=req.model_dump(), metrics=res["metrics"], data_source=p.name))
    return res


@router.post("/backtest/compare")
def compare(symbol: str = "BTCUSDT", timeframe: str = "1h", bars: int = 2000):
    """Compare preset strategy variants across market regimes."""
    p = get_provider()
    sym, tf = _sym(symbol), _tf(timeframe)
    ctx = MarketContext(get_instrument(sym), tf, p.closed_candles(sym, tf, bars),
                        p.closed_candles(sym, HTF_MAP[tf], max(300, bars * TIMEFRAMES[tf] // TIMEFRAMES[HTF_MAP[tf]] + 250)))
    variants = {
        "baseline": {},
        "strict_rr": {"min_rr": 2.5},
        "wide_stop": {"sl_buffer_atr": 0.75},
        "three_confirmations": {"min_confirmations": 3},
    }
    out = {}
    for name, v in variants.items():
        r = run_backtest(ctx, StrategyParams.from_dict(v), BacktestConfig(), simulated_data=p.is_simulated)
        out[name] = {"params": v, "metrics": r["metrics"], "by_regime": r["by_regime"]}
    return clean(out)
