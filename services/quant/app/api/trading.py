from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import analysis_service, get_db, paper_broker
from app.assistant.grounded import answer
from app.brokers.registry import BROKERS
from app.brokers.vault import VaultNotConfigured, encrypt
from app.config import get_settings
from app.core.jsonutil import clean
from app.data.instruments import get_instrument
from app.data.providers import get_provider
from app.db.audit import audit, verify_chain
from app.db.models import AuditLog, BrokerCredential, Order, Position
from app.engine.decision import StrategyParams
from app.execution.service import live_gate, submit_order
from app.execution.state import ensure_user, risk_config, strategy_params
from app.news.calendar import (
    blackout_status,
    events_for_symbol,
    get_calendar,
    impact_explanation,
)
from app.paper.simulator import OrderRequest
from app.risk.engine import RiskConfig, position_size

router = APIRouter(prefix="/api")


# ------------------------------------------------------------------ settings / mode / risk
@router.get("/settings")
def get_settings_(db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    return {"mode": st.mode, "kill_switch": st.kill_switch, "kill_switch_reason": st.kill_switch_reason,
            "live_opt_in_at": st.live_opt_in_at.isoformat() if st.live_opt_in_at else None,
            "risk": risk_config(st).to_dict(), "strategy": strategy_params(st).to_dict(),
            "preferences": st.preferences or {}, "live_trading_server_flag": get_settings().live_trading_enabled,
            "live_gate_missing": live_gate(db, st)}


class ModeReq(BaseModel):
    mode: str = Field(pattern="^(analysis|paper|live)$")
    confirm_phrase: str | None = None


@router.put("/settings/mode")
def set_mode(req: ModeReq, db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    if req.mode == "live":
        if req.confirm_phrase != "I UNDERSTAND LIVE TRADING RISKS":
            raise HTTPException(400, "Live mode requires the exact confirmation phrase.")
        st.live_opt_in_at = st.live_opt_in_at or dt.datetime.now(dt.timezone.utc)
        missing = live_gate(db, st)
        if missing:
            audit(db, "user", "mode.live_denied", {"missing": missing})
            db.commit()
            raise HTTPException(403, {"message": "Live trading requirements not met.", "missing": missing})
    prev = st.mode
    st.mode = req.mode
    audit(db, "user", "mode.changed", {"from": prev, "to": req.mode})
    return {"mode": st.mode}


@router.put("/settings/risk")
def set_risk(cfg: dict, db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    merged = RiskConfig.from_dict({**(st.risk_config or {}), **cfg})
    # hard ceilings that the UI cannot exceed
    if merged.max_risk_per_trade_pct > 5 or merged.max_daily_loss_pct > 20 or merged.max_leverage > 50:
        raise HTTPException(400, "Risk limits exceed platform ceilings (5% per trade, 20% daily, 50× leverage).")
    st.risk_config = merged.to_dict()
    audit(db, "user", "risk.updated", st.risk_config)
    return st.risk_config


@router.put("/settings/strategy")
def set_strategy(params: dict, db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    p = StrategyParams.from_dict({**(st.strategy_params or {}), **params})
    if p.min_confirmations < 2:
        raise HTTPException(400, "min_confirmations must be ≥ 2 (no single-indicator trading).")
    st.strategy_params = p.to_dict()
    audit(db, "user", "strategy.updated", st.strategy_params)
    return st.strategy_params


@router.put("/settings/preferences")
def set_prefs(prefs: dict, db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    st.preferences = {**(st.preferences or {}), **prefs}
    return st.preferences


class KillReq(BaseModel):
    engaged: bool
    reason: str | None = None
    flatten: bool = False


@router.post("/risk/kill-switch")
def kill_switch(req: KillReq, db: Session = Depends(get_db)):
    _, st, acct = ensure_user(db)
    st.kill_switch = req.engaged
    st.kill_switch_reason = (req.reason or "Manual") if req.engaged else None
    closed = []
    if req.engaged:
        for o in db.execute(select(Order).where(Order.account_id == acct.id, Order.status == "pending")).scalars():
            o.status, o.reject_reasons = "cancelled", ["Kill switch engaged."]
        if req.flatten:
            b = paper_broker()
            for p in b.open_positions(db, acct):
                b.close_position(db, acct, p, "kill_switch")
                closed.append(p.id)
    audit(db, "user", "kill_switch.set", {"engaged": req.engaged, "reason": req.reason, "flattened": closed})
    return {"kill_switch": st.kill_switch, "flattened_positions": closed}


class SizeReq(BaseModel):
    symbol: str
    entry: float
    stop_loss: float
    risk_pct: float | None = None


@router.post("/risk/position-size")
def size(req: SizeReq, db: Session = Depends(get_db)):
    _, st, acct = ensure_user(db)
    eq = paper_broker().summary(db, acct, st)["equity"]
    rp = req.risk_pct or risk_config(st).max_risk_per_trade_pct
    return clean({"equity": eq, "risk_pct": rp, **position_size(get_instrument(req.symbol), eq, rp, req.entry, req.stop_loss)})


# ------------------------------------------------------------------ paper trading
def _order_dict(o: Order) -> dict:
    return {"id": o.id, "client_order_id": o.client_order_id, "mode": o.mode, "symbol": o.symbol, "side": o.side,
            "type": o.type, "qty": o.qty, "limit_price": o.limit_price, "stop_price": o.stop_price,
            "stop_loss": o.stop_loss, "take_profit": o.take_profit, "status": o.status,
            "reject_reasons": o.reject_reasons, "risk_checks": o.risk_checks, "fill_price": o.fill_price,
            "fees": o.fees, "slippage": o.slippage, "latency_ms": o.latency_ms, "position_id": o.position_id,
            "created_at": o.created_at.isoformat() if o.created_at else None}


def _pos_dict(p: Position, unreal: float | None = None) -> dict:
    return {"id": p.id, "symbol": p.symbol, "side": p.side, "qty": p.qty, "entry_price": p.entry_price,
            "stop_loss": p.stop_loss, "take_profit": p.take_profit, "status": p.status,
            "opened_at": p.opened_at.isoformat() if p.opened_at else None,
            "closed_at": p.closed_at.isoformat() if p.closed_at else None, "exit_price": p.exit_price,
            "close_reason": p.close_reason, "realized_pnl": round(p.realized_pnl, 2), "fees": round(p.fees, 2),
            "initial_risk": p.initial_risk, "r_multiple": round(p.realized_pnl / p.initial_risk, 2) if p.initial_risk and p.status == "closed" else None,
            "unrealized_pnl": None if unreal is None else round(unreal, 2), "notes": p.notes, "tags": p.tags or [],
            "setup": p.setup}


@router.get("/paper/account")
def account(db: Session = Depends(get_db)):
    _, st, acct = ensure_user(db)
    b = paper_broker()
    b.process(db, acct, st, risk_config(st))
    return clean(b.summary(db, acct, st))


class OrderBody(BaseModel):
    symbol: str
    side: str = Field(pattern="^(buy|sell)$")
    qty: float = Field(gt=0)
    type: str = Field("market", pattern="^(market|limit|stop)$")
    limit_price: float | None = None
    stop_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    client_order_id: str | None = Field(None, max_length=64)
    from_setup: bool = False
    timeframe: str = "1h"


@router.post("/orders")
def place(body: OrderBody, db: Session = Depends(get_db)):
    _, st, acct = ensure_user(db)
    cfg = risk_config(st)
    sym = get_instrument(body.symbol).symbol
    now = get_provider().now()
    evs = get_calendar().events(int(now) - 86400, int(now) + 86400)
    bo = blackout_status(evs, sym, now, cfg.news_blackout_before_min, cfg.news_blackout_after_min)
    setup = None
    if body.from_setup:
        s = analysis_service().setup(sym, body.timeframe, strategy_params(st))
        setup = clean({k: s[k] for k in ("status", "direction", "quality", "plan", "reasons_for", "reasons_against",
                                         "missing", "bar_time", "timeframe", "confidence")})
    req = OrderRequest(sym, body.side, body.qty, body.type, body.limit_price, body.stop_price, body.stop_loss,
                       body.take_profit, body.client_order_id, setup)
    o = submit_order(db, paper_broker(), acct, st, cfg, req, bo)
    return clean(_order_dict(o))


@router.get("/orders")
def orders(limit: int = 100, db: Session = Depends(get_db)):
    _, _, acct = ensure_user(db)
    rows = db.execute(select(Order).where(Order.account_id == acct.id).order_by(Order.id.desc()).limit(limit)).scalars()
    return clean([_order_dict(o) for o in rows])


@router.delete("/orders/{order_id}")
def cancel(order_id: int, db: Session = Depends(get_db)):
    _, _, acct = ensure_user(db)
    o = db.get(Order, order_id)
    if not o or o.account_id != acct.id:
        raise HTTPException(404, "order not found")
    if o.status == "pending":
        o.status = "cancelled"
        audit(db, "user", "order.cancelled", {"order_id": o.id})
    return _order_dict(o)


@router.get("/positions")
def positions(status: str = "open", db: Session = Depends(get_db)):
    _, st, acct = ensure_user(db)
    b = paper_broker()
    b.process(db, acct, st, risk_config(st))
    rows = db.execute(select(Position).where(Position.account_id == acct.id, Position.status == status)
                      .order_by(Position.id.desc())).scalars()
    return clean([_pos_dict(p, b._unrealized(p) if p.status == "open" else None) for p in rows])


class ModifyReq(BaseModel):
    stop_loss: float | None = None
    take_profit: float | None = None


@router.patch("/positions/{pid}")
def modify(pid: int, req: ModifyReq, db: Session = Depends(get_db)):
    _, st, acct = ensure_user(db)
    p = db.get(Position, pid)
    if not p or p.account_id != acct.id or p.status != "open":
        raise HTTPException(404, "open position not found")
    if risk_config(st).require_stop_loss and req.stop_loss is None and p.stop_loss is not None and "stop_loss" in req.model_fields_set:
        raise HTTPException(400, "Stop-loss is mandatory and cannot be removed.")
    if req.stop_loss is not None:
        p.stop_loss = req.stop_loss
    if req.take_profit is not None:
        p.take_profit = req.take_profit
    audit(db, "user", "position.modified", {"position_id": pid, **req.model_dump()})
    return clean(_pos_dict(p))


@router.post("/positions/{pid}/close")
def close(pid: int, db: Session = Depends(get_db)):
    _, _, acct = ensure_user(db)
    p = db.get(Position, pid)
    if not p or p.account_id != acct.id:
        raise HTTPException(404, "position not found")
    return clean(_pos_dict(paper_broker().close_position(db, acct, p, "manual")))


@router.post("/paper/reset")
def reset(db: Session = Depends(get_db)):
    _, _, acct = ensure_user(db)
    b = paper_broker()
    for p in b.open_positions(db, acct):
        b.close_position(db, acct, p, "reset")
    acct.balance = acct.starting_balance
    audit(db, "user", "paper.reset", {"balance": acct.balance})
    return {"balance": acct.balance}


# ------------------------------------------------------------------ journal
@router.get("/journal")
def journal(db: Session = Depends(get_db)):
    _, _, acct = ensure_user(db)
    rows = list(db.execute(select(Position).where(Position.account_id == acct.id, Position.status == "closed")
                           .order_by(Position.closed_at.asc())).scalars())
    pnl = [p.realized_pnl for p in rows]
    wins = [x for x in pnl if x > 0]
    losses = [x for x in pnl if x <= 0]
    eq, curve = acct.starting_balance, []
    for p in rows:
        eq += p.realized_pnl
        curve.append({"time": int(p.closed_at.timestamp()), "equity": round(eq, 2)})
    by_symbol: dict = {}
    for p in rows:
        s = by_symbol.setdefault(p.symbol, {"trades": 0, "net": 0.0, "wins": 0})
        s["trades"] += 1; s["net"] += p.realized_pnl; s["wins"] += p.realized_pnl > 0
    return clean({
        "trades": [_pos_dict(p) for p in reversed(rows)],
        "stats": {"trades": len(rows), "net": round(sum(pnl), 2),
                  "win_rate": round(len(wins) / len(rows), 3) if rows else None,
                  "profit_factor": round(sum(wins) / -sum(losses), 2) if losses and sum(losses) < 0 else None,
                  "avg_win": round(sum(wins) / len(wins), 2) if wins else None,
                  "avg_loss": round(sum(losses) / len(losses), 2) if losses else None},
        "equity_curve": curve, "by_symbol": by_symbol,
    })


class NoteReq(BaseModel):
    notes: str | None = Field(None, max_length=5000)
    tags: list[str] | None = None


@router.patch("/journal/{pid}")
def note(pid: int, req: NoteReq, db: Session = Depends(get_db)):
    _, _, acct = ensure_user(db)
    p = db.get(Position, pid)
    if not p or p.account_id != acct.id:
        raise HTTPException(404, "trade not found")
    if req.notes is not None:
        p.notes = req.notes
    if req.tags is not None:
        p.tags = req.tags[:20]
    return clean(_pos_dict(p))


# ------------------------------------------------------------------ assistant
class AskReq(BaseModel):
    question: str = Field(max_length=1000)
    symbol: str = "BTCUSDT"
    timeframe: str = "1h"
    language: str = Field("en", pattern="^(en|bn)$")


@router.post("/assistant/ask")
def ask(req: AskReq, db: Session = Depends(get_db)):
    _, st, acct = ensure_user(db)
    svc = analysis_service()

    def events_fn(sym):
        now = get_provider().now()
        cal = get_calendar()
        evs = events_for_symbol(cal.events(int(now), int(now) + 86400), sym)
        return [e.to_dict() for e in evs if e.importance in ("high", "medium")], cal.name

    def journal_fn():
        p = db.execute(select(Position).where(Position.account_id == acct.id, Position.status == "closed",
                                              Position.realized_pnl < 0).order_by(Position.closed_at.desc()).limit(1)).scalar_one_or_none()
        return _pos_dict(p) if p else None

    def impact_fn(e: dict, sym: str):
        from app.news.calendar import EconomicEvent
        return impact_explanation(EconomicEvent(**e), sym)

    res = answer(req.question, req.language, get_instrument(req.symbol).symbol, req.timeframe,
                 analysis_fn=lambda s, tf: clean(svc.analysis(s, tf)),
                 setup_fn=lambda s, tf: clean(svc.setup(s, tf, strategy_params(st))),
                 events_fn=events_fn, journal_fn=journal_fn, impact_fn=impact_fn)
    return clean(res)


# ------------------------------------------------------------------ brokers / audit
@router.get("/brokers")
def brokers(db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    creds = db.execute(select(BrokerCredential).where(BrokerCredential.user_id == st.user_id)).scalars()
    return {"brokers": [b.to_dict() for b in BROKERS.values()],
            "connections": [{"id": c.id, "broker": c.broker, "label": c.label, "fingerprint": c.key_fingerprint,
                             "declared_permissions": c.declared_permissions, "verified": c.verified,
                             "created_at": c.created_at.isoformat()} for c in creds]}


class CredReq(BaseModel):
    broker: str
    label: str = Field(max_length=64)
    api_key: str = Field(min_length=8, max_length=512)
    api_secret: str = Field(min_length=8, max_length=512)
    declared_permissions: dict = Field(default_factory=dict)  # e.g. {"trade": true, "withdraw": false}


@router.post("/brokers/credentials", status_code=201)
def add_cred(req: CredReq, db: Session = Depends(get_db)):
    _, st, _ = ensure_user(db)
    if req.broker not in BROKERS or req.broker == "paper":
        raise HTTPException(400, "Unknown broker.")
    if req.declared_permissions.get("withdraw"):
        raise HTTPException(400, "Refusing API keys with withdrawal permission. Create a trade-only key.")
    try:
        ct, fp = encrypt({"api_key": req.api_key, "api_secret": req.api_secret})
    except VaultNotConfigured as e:
        raise HTTPException(503, str(e)) from e
    c = BrokerCredential(user_id=st.user_id, broker=req.broker, label=req.label, ciphertext=ct, key_fingerprint=fp,
                         declared_permissions=req.declared_permissions, verified=False)
    db.add(c)
    db.flush()
    audit(db, "user", "broker.credential_added", {"id": c.id, "broker": req.broker, "fingerprint": fp})
    return {"id": c.id, "broker": c.broker, "label": c.label, "fingerprint": fp, "verified": False,
            "note": "Stored encrypted. Verification requires the broker adapter (Phase 3)."}


@router.delete("/brokers/credentials/{cid}")
def del_cred(cid: int, db: Session = Depends(get_db)):
    c = db.get(BrokerCredential, cid)
    if not c:
        raise HTTPException(404, "not found")
    db.delete(c)
    audit(db, "user", "broker.credential_deleted", {"id": cid})
    return {"deleted": cid}


@router.get("/audit")
def audit_log(limit: int = 200, db: Session = Depends(get_db)):
    rows = db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).scalars()
    return {"chain_valid": verify_chain(db),
            "entries": [{"id": r.id, "ts": r.ts.isoformat(), "actor": r.actor, "action": r.action, "payload": r.payload,
                         "hash": r.hash[:16]} for r in rows]}
