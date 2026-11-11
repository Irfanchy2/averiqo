"""Pre-trade risk engine. Every order — paper or live — must pass `validate()`.

All checks are evaluated and returned (not short-circuited) so the UI and audit log show the
complete picture of why an order was approved or rejected.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

from app.data.instruments import Instrument, quote_to_account


@dataclass
class RiskConfig:
    max_risk_per_trade_pct: float = 1.0
    max_daily_loss_pct: float = 3.0
    max_total_exposure_pct: float = 300.0  # sum of notional / equity
    max_leverage: float = 10.0
    max_open_trades: int = 3
    max_spread_atr: float = 0.25  # reject if spread > 25% of ATR
    max_slippage_bps: float = 15.0
    require_stop_loss: bool = True
    stale_price_seconds: int = 30
    news_blackout_before_min: int = 30
    news_blackout_after_min: int = 30
    flatten_on_daily_loss: bool = False

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict | None) -> "RiskConfig":
        base = RiskConfig()
        if not d:
            return base
        for k, v in d.items():
            if hasattr(base, k):
                setattr(base, k, type(getattr(base, k))(v))
        return base


@dataclass
class OrderIntent:
    symbol: str
    side: str  # buy | sell
    qty: float
    entry_price: float
    stop_loss: float | None
    take_profit: float | None = None


@dataclass
class AccountState:
    equity: float
    open_positions: list[dict]  # each: symbol, side, qty, entry_price, notional
    daily_pnl: float  # realized + unrealized since 00:00 UTC
    kill_switch: bool = False


@dataclass
class MarketState:
    bid: float
    ask: float
    quote_age_s: float
    atr: float | None
    news_blackout: dict | None = None


@dataclass
class RiskDecision:
    approved: bool
    checks: list[dict] = field(default_factory=list)

    def reasons(self) -> list[str]:
        return [c["detail"] for c in self.checks if not c["passed"]]

    def to_dict(self) -> dict:
        return {"approved": self.approved, "checks": self.checks}


def round_qty(inst: Instrument, qty: float) -> float:
    steps = math.floor(qty / inst.qty_step + 1e-9)
    return round(steps * inst.qty_step, 10)


def position_size(inst: Instrument, equity: float, risk_pct: float, entry: float, stop: float) -> dict:
    """Quantity such that hitting the stop loses ~risk_pct of equity (rounded DOWN to qty step)."""
    per_unit = abs(entry - stop) * inst.contract_size * quote_to_account(inst, entry)
    if per_unit <= 0:
        return {"qty": 0.0, "risk_amount": 0.0, "notional": 0.0, "note": "stop equals entry"}
    risk_amount = equity * risk_pct / 100.0
    qty = round_qty(inst, risk_amount / per_unit)
    note = None
    if qty < inst.min_qty:
        note = f"Risk budget too small for minimum size {inst.min_qty}; trade not sizable."
        qty = 0.0
    notional = qty * inst.contract_size * entry * quote_to_account(inst, entry)
    return {"qty": qty, "risk_amount": round(qty * per_unit, 2), "notional": round(notional, 2),
            "risk_per_unit": per_unit, "note": note}


def validate(intent: OrderIntent, inst: Instrument, acct: AccountState, mkt: MarketState,
             cfg: RiskConfig) -> RiskDecision:
    checks: list[dict] = []

    def chk(name: str, ok: bool, detail: str) -> None:
        checks.append({"name": name, "passed": bool(ok), "detail": detail})

    price = mkt.ask if intent.side == "buy" else mkt.bid
    conv = quote_to_account(inst, price)
    notional = intent.qty * inst.contract_size * price * conv

    chk("kill_switch", not acct.kill_switch, "Kill switch is engaged — all new orders blocked." if acct.kill_switch else "Kill switch off.")
    chk("stale_price", mkt.quote_age_s <= cfg.stale_price_seconds,
        f"Quote age {mkt.quote_age_s:.1f}s (limit {cfg.stale_price_seconds}s).")
    chk("quantity", intent.qty >= inst.min_qty and abs(intent.qty - round_qty(inst, intent.qty)) < 1e-9,
        f"Qty {intent.qty} (min {inst.min_qty}, step {inst.qty_step}).")

    has_sl = intent.stop_loss is not None and intent.stop_loss > 0
    sl_side_ok = has_sl and ((intent.side == "buy" and intent.stop_loss < price) or (intent.side == "sell" and intent.stop_loss > price))
    if cfg.require_stop_loss:
        chk("stop_loss", sl_side_ok, "Stop-loss present and on the correct side." if sl_side_ok else "Mandatory stop-loss missing or on the wrong side of price.")

    if has_sl and sl_side_ok:
        risk_amt = abs(price - intent.stop_loss) * intent.qty * inst.contract_size * conv
        risk_pct = 100 * risk_amt / acct.equity if acct.equity > 0 else math.inf
        chk("position_risk", risk_pct <= cfg.max_risk_per_trade_pct + 1e-9,
            f"Trade risk {risk_pct:.2f}% of equity (limit {cfg.max_risk_per_trade_pct}%).")

    daily_loss_pct = -100 * acct.daily_pnl / acct.equity if acct.equity > 0 else 0
    chk("daily_loss", daily_loss_pct < cfg.max_daily_loss_pct,
        f"Daily P&L {-daily_loss_pct:+.2f}% (max loss {cfg.max_daily_loss_pct}%).")

    total_notional = sum(p.get("notional", 0.0) for p in acct.open_positions) + notional
    exposure_pct = 100 * total_notional / acct.equity if acct.equity > 0 else math.inf
    chk("total_exposure", exposure_pct <= cfg.max_total_exposure_pct,
        f"Total exposure {exposure_pct:.0f}% of equity (limit {cfg.max_total_exposure_pct}%).")
    eff_lev = total_notional / acct.equity if acct.equity > 0 else math.inf
    lev_limit = min(cfg.max_leverage, inst.max_leverage)
    chk("leverage", eff_lev <= lev_limit, f"Effective leverage {eff_lev:.2f}× (limit {lev_limit}×).")
    chk("open_trades", len(acct.open_positions) < cfg.max_open_trades,
        f"{len(acct.open_positions)} open trade(s) (limit {cfg.max_open_trades}).")

    spread = mkt.ask - mkt.bid
    if mkt.atr and mkt.atr > 0:
        chk("spread", spread <= cfg.max_spread_atr * mkt.atr,
            f"Spread {spread:.5g} = {spread / mkt.atr:.0%} of ATR (limit {cfg.max_spread_atr:.0%}).")
    if mkt.news_blackout and mkt.news_blackout.get("active"):
        chk("news_blackout", False, mkt.news_blackout.get("reason", "High-impact news window."))
    else:
        chk("news_blackout", True, "No high-impact event window active.")

    return RiskDecision(all(c["passed"] for c in checks), checks)
