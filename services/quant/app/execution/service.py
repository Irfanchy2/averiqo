"""Order routing with trading-mode separation.

analysis -> never routes orders
paper    -> PaperBroker
live     -> blocked unless EVERY gate passes (server flag, explicit opt-in, verified adapter,
            risk validation). In this release no live adapter is verified, so live always rejects.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.brokers.registry import BROKERS
from app.config import get_settings
from app.db.audit import audit
from app.db.models import BrokerCredential, Order, PaperAccount, TradingSettings
from app.paper.simulator import OrderRequest, PaperBroker
from app.risk.engine import RiskConfig


def live_gate(db: Session, st: TradingSettings) -> list[str]:
    """Return the list of unmet requirements for live trading (empty = allowed)."""
    missing = []
    if not get_settings().live_trading_enabled:
        missing.append("Server flag TP_LIVE_TRADING_ENABLED is false.")
    if st.live_opt_in_at is None:
        missing.append("User has not explicitly opted in to live trading.")
    verified = db.execute(select(BrokerCredential).where(BrokerCredential.user_id == st.user_id,
                                                         BrokerCredential.verified.is_(True))).first()
    if not verified:
        missing.append("No verified broker connection.")
    if not any(b.status == "available" and b.key != "paper" for b in BROKERS.values()):
        missing.append("No live broker adapter has passed compatibility verification in this release.")
    if st.kill_switch:
        missing.append("Kill switch is engaged.")
    return missing


def submit_order(db: Session, broker: PaperBroker, acct: PaperAccount, st: TradingSettings, cfg: RiskConfig,
                 req: OrderRequest, news_blackout: dict | None) -> Order:
    if st.mode == "analysis":
        o = Order(account_id=acct.id, client_order_id=req.client_order_id or f"analysis-{id(req)}", mode="analysis",
                  symbol=req.symbol, side=req.side, type=req.type, qty=req.qty, status="rejected",
                  reject_reasons=["Analysis-only mode: order routing is disabled."])
        db.add(o); db.flush()
        audit(db, "execution", "order.rejected", {"reason": "analysis_mode", "symbol": req.symbol})
        return o
    if st.mode == "live":
        missing = live_gate(db, st)
        o = Order(account_id=acct.id, client_order_id=req.client_order_id or f"live-{id(req)}", mode="live",
                  symbol=req.symbol, side=req.side, type=req.type, qty=req.qty, status="rejected",
                  reject_reasons=missing or ["Live adapter routing not implemented in this release."])
        db.add(o); db.flush()
        audit(db, "execution", "order.rejected", {"reason": "live_gate", "missing": o.reject_reasons})
        return o
    return broker.place_order(db, acct, st, cfg, req, news_blackout)
