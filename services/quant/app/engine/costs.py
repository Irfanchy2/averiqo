"""Trading-cost model shared by the decision engine, paper simulator and backtester."""
from __future__ import annotations

from app.data.instruments import Instrument


def round_trip_cost_price(inst: Instrument, price: float, spread: float, slippage_bps: float) -> float:
    """Expected round-trip cost expressed in PRICE units per 1 unit of contract.

    = full spread (paid once across entry+exit) + slippage on both sides + fees/commission on both sides.
    """
    slip = 2 * price * slippage_bps / 10_000
    fee = 2 * price * inst.taker_fee_rate
    commission = 2 * inst.commission_per_lot / inst.contract_size  # per unit of base
    return spread + slip + fee + commission


def default_slippage_bps(inst: Instrument) -> float:
    return {"crypto": 2.0, "forex": 0.5, "metal": 1.0, "energy": 2.0}[inst.asset_class]
