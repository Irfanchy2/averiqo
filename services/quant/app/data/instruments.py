"""Instrument specifications.

Contract sizes / steps / fees below are *typical defaults* used by the paper simulator and the
backtester. They are NOT a statement of any broker's actual terms: when a broker adapter is
connected (Phase 3), its live symbol specification must override these values.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Instrument:
    symbol: str
    name: str
    asset_class: str  # crypto | metal | forex | energy
    tick_size: float
    contract_size: float  # units of base asset per 1.0 quantity (lot)
    qty_step: float
    min_qty: float
    typical_spread: float  # in price units, simulated
    taker_fee_rate: float  # fraction of notional per side (crypto); 0 for spread-only CFD/FX
    commission_per_lot: float  # per side, account currency
    sim_base_price: float  # starting point of the simulated feed only
    sim_daily_vol: float  # daily volatility (fraction) of the simulated feed
    max_leverage: float
    news_currencies: tuple[str, ...]  # economic-calendar tags that move this instrument

    def to_dict(self) -> dict:
        d = asdict(self)
        d["news_currencies"] = list(self.news_currencies)
        return d


INSTRUMENTS: dict[str, Instrument] = {
    i.symbol: i
    for i in [
        Instrument("BTCUSDT", "Bitcoin / Tether", "crypto", 0.01, 1.0, 0.0001, 0.0001, 1.0,
                   0.001, 0.0, 64_000.0, 0.030, 5.0, ("USD", "CRYPTO")),
        Instrument("ETHUSDT", "Ether / Tether", "crypto", 0.01, 1.0, 0.001, 0.001, 0.15,
                   0.001, 0.0, 3_100.0, 0.038, 5.0, ("USD", "CRYPTO")),
        Instrument("XAUUSD", "Gold / US Dollar", "metal", 0.01, 100.0, 0.01, 0.01, 0.25,
                   0.0, 3.5, 2_350.0, 0.010, 20.0, ("USD", "GOLD")),
        Instrument("EURUSD", "Euro / US Dollar", "forex", 0.00001, 100_000.0, 0.01, 0.01, 0.00008,
                   0.0, 3.5, 1.0850, 0.005, 30.0, ("USD", "EUR")),
        Instrument("GBPUSD", "Pound / US Dollar", "forex", 0.00001, 100_000.0, 0.01, 0.01, 0.00010,
                   0.0, 3.5, 1.2700, 0.006, 30.0, ("USD", "GBP")),
        Instrument("USDJPY", "US Dollar / Yen", "forex", 0.001, 100_000.0, 0.01, 0.01, 0.010,
                   0.0, 3.5, 151.00, 0.006, 30.0, ("USD", "JPY")),
        Instrument("USOIL", "WTI Crude Oil", "energy", 0.01, 1_000.0, 0.01, 0.01, 0.03,
                   0.0, 3.5, 78.00, 0.020, 10.0, ("USD", "OIL")),
    ]
}


def get_instrument(symbol: str) -> Instrument:
    try:
        return INSTRUMENTS[symbol.upper()]
    except KeyError as e:
        raise KeyError(f"Unsupported symbol {symbol!r}") from e


def quote_to_account(inst: Instrument, price: float) -> float:
    """Conversion factor from the instrument's quote currency to USD account currency."""
    if inst.symbol == "USDJPY":
        return 1.0 / price
    return 1.0
