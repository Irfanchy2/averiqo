import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("TP_DATABASE_URL", "sqlite:///:memory:")

import numpy as np  # noqa: E402
import pytest  # noqa: E402

from app.core.types import Candles  # noqa: E402
from app.data.providers import SimulatedProvider  # noqa: E402

FIXED_NOW = 1_760_000_000.0  # deterministic clock for tests


@pytest.fixture(scope="session")
def provider() -> SimulatedProvider:
    return SimulatedProvider(seed=11, clock=lambda: FIXED_NOW)


@pytest.fixture(scope="session")
def candles_1h(provider) -> Candles:
    return provider.closed_candles("BTCUSDT", "1h", 800)


def make_candles(closes, spread=0.5, start=1_700_000_000, step=3600, volume=100.0) -> Candles:
    closes = np.asarray(closes, dtype=float)
    opens = np.r_[closes[0], closes[:-1]]
    highs = np.maximum(opens, closes) + spread
    lows = np.minimum(opens, closes) - spread
    t = start + np.arange(len(closes), dtype=np.int64) * step
    return Candles(t, opens, highs, lows, closes, np.full(len(closes), volume))
