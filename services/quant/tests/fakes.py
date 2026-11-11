from app.core.types import Candles
from app.data.providers import MarketDataProvider, Quote
from tests.conftest import make_candles


class FakeProvider(MarketDataProvider):
    """Deterministic provider whose price/time tests can move by hand."""
    name = "fake"
    is_simulated = True

    def __init__(self, price=100.0, spread=0.02, t=1_760_000_000.0):
        self.price, self.spread, self.t = price, spread, t
        self.quote_ts = t
        self.fail = False

    def now(self):
        return self.t

    def candles(self, symbol, timeframe, limit=500) -> Candles:
        return make_candles([self.price] * limit, spread=0.5, start=int(self.t) - limit * 300, step=300)

    def quote(self, symbol) -> Quote:
        if self.fail:
            from app.data.providers import DataUnavailable
            raise DataUnavailable("feed down")
        return Quote(symbol, self.price - self.spread / 2, self.price + self.spread / 2, self.price, self.spread,
                     self.quote_ts, self.name)
