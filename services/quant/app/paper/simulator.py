"""Paper-trading simulator.

Fills use the provider's bid/ask (spread), an adverse latency drift (price move during the
simulated round-trip latency), random slippage, and instrument fees/commissions. Every order is
validated by the same risk engine used for live trading. Orders are idempotent on
``client_order_id`` (duplicate-order prevention).

Stops/targets are checked against the current quote each time ``process()`` runs (a background
loop calls it every second). If the service is down, exits are evaluated on the next quote, so
fills can be worse than the stop level — like a real stop-market order after a gap.
"""
from __future__ import annotations

import datetime as dt
import math
import random
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.data.instruments import get_instrument, quote_to_account
from app.data.providers import DataUnavailable, MarketDataProvider
from app.db.audit import audit
from app.db.models import Order, PaperAccount, Position, TradingSettings, utcnow
from app.engine.costs import default_slippage_bps
from app.indicators.core import atr as atr_fn
from app.risk.engine import AccountState, MarketState, OrderIntent, RiskConfig, validate


@dataclass
class OrderRequest:
    symbol: str
    side: str  # buy | sell
    qty: float
    type: str = "market"
    limit_price: float | None = None
    stop_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    client_order_id: str | None = None
    setup: dict | None = None


class PaperBroker:
    def __init__(self, provider: MarketDataProvider, latency_ms: int = 150, seed: int | None = None):
        self.provider = provider
        self.latency_ms = latency_ms
        self.rng = random.Random(seed)

    # ------------------------------------------------------------------ helpers
    def _atr(self, symbol: str) -> float | None:
        try:
            c = self.provider.closed_candles(symbol, "5m", 60)
            v = atr_fn(c, 14)[-1]
            return None if np.isnan(v) else float(v)
        except Exception:
            return None

    def _fill(self, symbol: str, side: str) -> tuple[float, float, float]:
        """Return (fill_price, slippage_price_units, quote_age)."""
        inst = get_instrument(symbol)
        q = self.provider.quote(symbol)
        raw = q.ask if side == "buy" else q.bid
        sigma_s = inst.sim_daily_vol / math.sqrt(86400)
        drift = raw * sigma_s * math.sqrt(self.latency_ms / 1000) * abs(self.rng.gauss(0, 1))
        rand_slip = raw * default_slippage_bps(inst) / 10_000 * self.rng.random()
        slip = drift + rand_slip
        px = raw + slip if side == "buy" else raw - slip
        return px, slip, self.provider.now() - q.timestamp

    def _fees(self, symbol: str, price: float, qty: float) -> float:
        inst = get_instrument(symbol)
        return qty * inst.contract_size * price * inst.taker_fee_rate * quote_to_account(inst, price) + qty * inst.commission_per_lot

    def _unrealized(self, p: Position) -> float:
        inst = get_instrument(p.symbol)
        q = self.provider.quote(p.symbol)
        exit_px = q.bid if p.side == "long" else q.ask
        d = 1 if p.side == "long" else -1
        return d * (exit_px - p.entry_price) * p.qty * inst.contract_size * quote_to_account(inst, exit_px)

    def open_positions(self, db: Session, acct: PaperAccount) -> list[Position]:
        return list(db.execute(select(Position).where(Position.account_id == acct.id, Position.status == "open")).scalars())

    def account_state(self, db: Session, acct: PaperAccount, kill_switch: bool) -> tuple[AccountState, dict]:
        pos = self.open_positions(db, acct)
        unreal, rows = 0.0, []
        for p in pos:
            inst = get_instrument(p.symbol)
            u = self._unrealized(p)
            unreal += u
            mid = self.provider.quote(p.symbol).mid
            rows.append({"symbol": p.symbol, "side": p.side, "qty": p.qty, "entry_price": p.entry_price,
                         "notional": p.qty * inst.contract_size * mid * quote_to_account(inst, mid)})
        day0 = dt.datetime.fromtimestamp(self.provider.now(), dt.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        closed_today = db.execute(select(Position).where(Position.account_id == acct.id, Position.status == "closed",
                                                         Position.closed_at >= day0)).scalars()
        realized_today = sum(p.realized_pnl for p in closed_today)
        equity = acct.balance + unreal
        state = AccountState(equity=equity, open_positions=rows, daily_pnl=realized_today + unreal, kill_switch=kill_switch)
        return state, {"unrealized": unreal, "realized_today": realized_today}

    def summary(self, db: Session, acct: PaperAccount, st: TradingSettings) -> dict:
        state, extra = self.account_state(db, acct, st.kill_switch)
        exposure = sum(r["notional"] for r in state.open_positions)
        return {
            "account_id": acct.id, "currency": acct.currency, "mode": st.mode,
            "starting_balance": acct.starting_balance, "balance": round(acct.balance, 2),
            "equity": round(state.equity, 2), "unrealized_pnl": round(extra["unrealized"], 2),
            "daily_pnl": round(state.daily_pnl, 2), "open_positions": len(state.open_positions),
            "exposure": round(exposure, 2), "exposure_pct": round(100 * exposure / state.equity, 1) if state.equity > 0 else None,
            "kill_switch": st.kill_switch, "kill_switch_reason": st.kill_switch_reason,
            "data_source": self.provider.name, "simulated_data": self.provider.is_simulated,
        }

    # ------------------------------------------------------------------ orders
    def place_order(self, db: Session, acct: PaperAccount, st: TradingSettings, cfg: RiskConfig,
                    req: OrderRequest, news_blackout: dict | None = None) -> Order:
        inst = get_instrument(req.symbol)
        cid = req.client_order_id or f"auto-{utcnow().timestamp():.6f}-{self.rng.randrange(1 << 30)}"
        existing = db.execute(select(Order).where(Order.account_id == acct.id, Order.client_order_id == cid)).scalar_one_or_none()
        if existing is not None:
            audit(db, "user", "order.duplicate_ignored", {"client_order_id": cid, "order_id": existing.id})
            return existing

        o = Order(account_id=acct.id, client_order_id=cid, mode="paper", symbol=inst.symbol, side=req.side,
                  type=req.type, qty=req.qty, limit_price=req.limit_price, stop_price=req.stop_price,
                  stop_loss=req.stop_loss, take_profit=req.take_profit, setup=req.setup, latency_ms=self.latency_ms)
        try:
            q = self.provider.quote(inst.symbol)
        except DataUnavailable as e:
            return self._reject(db, o, [f"Market data unavailable: {e}"], [])
        state, _ = self.account_state(db, acct, st.kill_switch)
        ref = req.limit_price or req.stop_price or (q.ask if req.side == "buy" else q.bid)
        intent = OrderIntent(inst.symbol, req.side, req.qty, ref, req.stop_loss, req.take_profit)
        mkt = MarketState(q.bid, q.ask, self.provider.now() - q.timestamp, self._atr(inst.symbol), news_blackout)
        decision = validate(intent, inst, state, mkt, cfg)
        o.risk_checks = decision.checks
        if req.type in ("limit", "stop") and not (req.limit_price or req.stop_price):
            return self._reject(db, o, ["Limit/stop order requires a trigger price."], decision.checks)
        if not decision.approved:
            return self._reject(db, o, decision.reasons(), decision.checks)

        db.add(o)
        try:
            db.flush()
        except IntegrityError:  # concurrent duplicate
            db.rollback()
            return db.execute(select(Order).where(Order.account_id == acct.id, Order.client_order_id == cid)).scalar_one()
        audit(db, "user", "order.accepted", {"order_id": o.id, "client_order_id": cid, "symbol": o.symbol,
                                             "side": o.side, "qty": o.qty, "type": o.type, "risk_checks": decision.checks})
        if req.type == "market":
            self._execute(db, acct, o, cfg)
        return o

    def _reject(self, db: Session, o: Order, reasons: list[str], checks: list) -> Order:
        o.status = "rejected"
        o.reject_reasons = reasons
        o.risk_checks = checks
        db.add(o)
        db.flush()
        audit(db, "risk_engine", "order.rejected", {"order_id": o.id, "client_order_id": o.client_order_id,
                                                    "symbol": o.symbol, "reasons": reasons})
        return o

    def _execute(self, db: Session, acct: PaperAccount, o: Order, cfg: RiskConfig) -> None:
        px, slip, _ = self._fill(o.symbol, o.side)
        slip_bps = 10_000 * slip / px
        if slip_bps > cfg.max_slippage_bps:
            o.status = "rejected"
            o.reject_reasons = [f"Simulated slippage {slip_bps:.1f} bps exceeds limit {cfg.max_slippage_bps} bps."]
            audit(db, "risk_engine", "order.rejected", {"order_id": o.id, "reasons": o.reject_reasons})
            return
        fee = self._fees(o.symbol, px, o.qty)
        inst = get_instrument(o.symbol)
        risk = abs(px - o.stop_loss) * o.qty * inst.contract_size * quote_to_account(inst, px) if o.stop_loss else None
        p = Position(account_id=acct.id, symbol=o.symbol, side="long" if o.side == "buy" else "short", qty=o.qty,
                     entry_price=px, stop_loss=o.stop_loss, take_profit=o.take_profit, fees=fee,
                     realized_pnl=-fee, initial_risk=risk, setup=o.setup)
        db.add(p)
        db.flush()
        acct.balance -= fee
        o.status, o.fill_price, o.fees, o.slippage, o.filled_at, o.position_id = "filled", px, fee, slip, utcnow(), p.id
        audit(db, "paper_broker", "order.filled", {"order_id": o.id, "position_id": p.id, "price": px,
                                                   "slippage": slip, "fees": fee})

    def close_position(self, db: Session, acct: PaperAccount, p: Position, reason: str = "manual") -> Position:
        if p.status != "open":
            return p
        side = "sell" if p.side == "long" else "buy"
        px, slip, _ = self._fill(p.symbol, side)
        inst = get_instrument(p.symbol)
        fee = self._fees(p.symbol, px, p.qty)
        d = 1 if p.side == "long" else -1
        gross = d * (px - p.entry_price) * p.qty * inst.contract_size * quote_to_account(inst, px)
        p.status, p.exit_price, p.closed_at, p.close_reason = "closed", px, utcnow(), reason
        p.fees += fee
        p.realized_pnl += gross - fee
        acct.balance += gross - fee
        audit(db, "paper_broker", "position.closed", {"position_id": p.id, "reason": reason, "price": px,
                                                      "pnl": p.realized_pnl})
        return p

    # ------------------------------------------------------------------ periodic processing
    def process(self, db: Session, acct: PaperAccount, st: TradingSettings, cfg: RiskConfig) -> list[dict]:
        events = []
        for p in self.open_positions(db, acct):
            try:
                q = self.provider.quote(p.symbol)
            except DataUnavailable:
                continue  # disconnect protection: no action on missing data; positions keep broker-side SL in live mode
            px = q.bid if p.side == "long" else q.ask
            if p.stop_loss and ((p.side == "long" and px <= p.stop_loss) or (p.side == "short" and px >= p.stop_loss)):
                self.close_position(db, acct, p, "stop_loss"); events.append({"position_id": p.id, "event": "stop_loss"})
            elif p.take_profit and ((p.side == "long" and px >= p.take_profit) or (p.side == "short" and px <= p.take_profit)):
                self.close_position(db, acct, p, "take_profit"); events.append({"position_id": p.id, "event": "take_profit"})
        for o in db.execute(select(Order).where(Order.account_id == acct.id, Order.status == "pending")).scalars():
            try:
                q = self.provider.quote(o.symbol)
            except DataUnavailable:
                continue
            trig = False
            if o.type == "limit":
                trig = (o.side == "buy" and q.ask <= o.limit_price) or (o.side == "sell" and q.bid >= o.limit_price)
            elif o.type == "stop":
                trig = (o.side == "buy" and q.ask >= o.stop_price) or (o.side == "sell" and q.bid <= o.stop_price)
            if trig:
                if st.kill_switch:
                    o.status, o.reject_reasons = "cancelled", ["Kill switch engaged before trigger."]
                else:
                    self._execute(db, acct, o, cfg)
                    events.append({"order_id": o.id, "event": "triggered"})
        # daily loss guard
        state, _ = self.account_state(db, acct, st.kill_switch)
        if not st.kill_switch and state.equity > 0 and -100 * state.daily_pnl / state.equity >= cfg.max_daily_loss_pct:
            st.kill_switch, st.kill_switch_reason = True, f"Daily loss limit {cfg.max_daily_loss_pct}% reached."
            audit(db, "risk_engine", "kill_switch.auto", {"daily_pnl": state.daily_pnl, "equity": state.equity})
            events.append({"event": "kill_switch"})
            if cfg.flatten_on_daily_loss:
                for p in self.open_positions(db, acct):
                    self.close_position(db, acct, p, "daily_loss_flatten")
        return events
