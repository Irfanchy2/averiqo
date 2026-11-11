"""Core value types shared by every quantitative module."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np

TIMEFRAMES: dict[str, int] = {
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1D": 86400,
}

# Higher timeframe used for directional bias (decision-engine layer 1).
HTF_MAP: dict[str, str] = {
    "1m": "15m",
    "3m": "30m",
    "5m": "1h",
    "15m": "4h",
    "30m": "4h",
    "1h": "4h",
    "4h": "1D",
    "1D": "1D",
}


class Direction(str, Enum):
    LONG = "long"
    SHORT = "short"


@dataclass(frozen=True)
class Candles:
    """Column-oriented OHLCV. `time` is the bar OPEN time in unix seconds (UTC)."""

    time: np.ndarray
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray

    def __len__(self) -> int:
        return int(self.time.shape[0])

    def slice(self, start: int, stop: int) -> "Candles":
        return Candles(
            self.time[start:stop],
            self.open[start:stop],
            self.high[start:stop],
            self.low[start:stop],
            self.close[start:stop],
            self.volume[start:stop],
        )

    def to_records(self) -> list[dict]:
        return [
            {
                "time": int(t),
                "open": float(o),
                "high": float(h),
                "low": float(lo),
                "close": float(c),
                "volume": float(v),
            }
            for t, o, h, lo, c, v in zip(
                self.time, self.open, self.high, self.low, self.close, self.volume
            )
        ]

    @staticmethod
    def from_records(rows: list[dict]) -> "Candles":
        def col(k: str) -> np.ndarray:
            return np.array([r[k] for r in rows], dtype=float)

        return Candles(
            np.array([int(r["time"]) for r in rows], dtype=np.int64),
            col("open"),
            col("high"),
            col("low"),
            col("close"),
            col("volume"),
        )


def aggregate(c: Candles, tf_seconds: int) -> Candles:
    """Aggregate lower-timeframe candles into epoch-aligned buckets of `tf_seconds`."""
    if len(c) == 0:
        return c
    bucket = c.time // tf_seconds
    starts = np.flatnonzero(np.r_[True, bucket[1:] != bucket[:-1]])
    ends = np.r_[starts[1:], len(c)]
    return Candles(
        bucket[starts] * tf_seconds,
        c.open[starts],
        np.maximum.reduceat(c.high, starts),
        np.minimum.reduceat(c.low, starts),
        c.close[ends - 1],
        np.add.reduceat(c.volume, starts),
    )
