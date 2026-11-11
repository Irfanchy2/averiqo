"""Market data providers.

* SimulatedProvider (default): a deterministic, regime-switching synthetic feed. Every response
  carries ``source="simulated"`` and the UI shows a SIMULATED badge. Prices are NOT real.
* BinancePublicProvider: Binance's public, keyless REST klines endpoint (crypto pairs only).
  Usage is subject to Binance's API Terms of Use; it is market data only (no trading).

Higher timeframes are always aggregated from the provider's base series so that every timeframe
is mutually consistent (a requirement for honest multi-timeframe analysis).
"""
from __future__ import annotations

import math
import threading
import time as _time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable

import httpx
import numpy as np

from app.core.types import TIMEFRAMES, Candles, aggregate
from app.data.instruments import INSTRUMENTS, Instrument, get_instrument


@dataclass
class Quote:
    symbol: str
    bid: float
    ask: float
    mid: float
    spread: float
    timestamp: float  # unix seconds of the last price update
    source: str

    def to_dict(self) -> dict:
        return self.__dict__.copy()


class DataUnavailable(RuntimeError):
    pass


class MarketDataProvider(ABC):
    name: str = "abstract"
    is_simulated: bool = False

    @abstractmethod
    def candles(self, symbol: str, timeframe: str, limit: int = 500) -> Candles:
        """Return up to `limit` most recent candles. The LAST candle may still be forming."""

    @abstractmethod
    def quote(self, symbol: str) -> Quote: ...

    def now(self) -> float:
        return _time.time()

    def closed_candles(self, symbol: str, timeframe: str, limit: int = 500) -> Candles:
        """Only fully closed candles — analysis must never use the forming bar."""
        c = self.candles(symbol, timeframe, limit + 1)
        tf = TIMEFRAMES[timeframe]
        if len(c) and c.time[-1] + tf > self.now():
            c = c.slice(0, len(c) - 1)
        return c.slice(max(0, len(c) - limit), len(c))


# --------------------------------------------------------------------------------------------
# Simulated provider
# --------------------------------------------------------------------------------------------

BASE_TF = 300  # 5m base series for long history
REFINE_DAYS = 10  # 1m resolution available for the most recent days
HISTORY_DAYS = 420

# regime: (drift per day as fraction, vol multiplier)
_REGIMES = np.array([[0.006, 0.9], [-0.006, 0.9], [0.0, 0.7], [0.0, 1.8]])
_TRANSITION_P = 1.0 / 600.0


def _intraday_vol_profile(t: np.ndarray) -> np.ndarray:
    """Session seasonality: quieter Asia, busier London/NY overlap."""
    hour = (t % 86400) / 3600.0
    return 0.75 + 0.35 * np.exp(-((hour - 8.0) ** 2) / 4.0) + 0.55 * np.exp(-((hour - 14.0) ** 2) / 5.0)


class _SymbolSeries:
    def __init__(self, inst: Instrument, seed: int, now: float):
        self.inst = inst
        self.rng = np.random.default_rng(seed)
        self.regime = 2
        self.log_anchor = math.log(inst.sim_base_price)
        self.sigma5 = inst.sim_daily_vol / math.sqrt(288.0)
        end = int(now // BASE_TF) * BASE_TF + BASE_TF  # exclusive end, covers current 5m bar
        start = end - HISTORY_DAYS * 86400
        self.base = self._gen_base(start, (end - start) // BASE_TF, inst.sim_base_price)
        self.m1 = self._refine(self.base.slice(len(self.base) - REFINE_DAYS * 288, len(self.base)))

    def _gen_base(self, start: int, n: int, p0: float) -> Candles:
        rng = self.rng
        t = start + np.arange(n, dtype=np.int64) * BASE_TF
        seasonal = _intraday_vol_profile(t)
        rets = np.empty(n)
        logp = math.log(p0)
        closes = np.empty(n)
        opens = np.empty(n)
        for i in range(n):
            if rng.random() < _TRANSITION_P:
                self.regime = int(rng.integers(0, len(_REGIMES)))
            drift, volm = _REGIMES[self.regime]
            mean_rev = -0.0004 * (logp - self.log_anchor)  # keep the synthetic series bounded
            r = drift / 288.0 + mean_rev + self.sigma5 * volm * seasonal[i] * rng.standard_t(5) / 1.29
            opens[i] = math.exp(logp)
            logp += r
            rets[i] = r
            closes[i] = math.exp(logp)
        wick = np.abs(rng.normal(0, 0.6, (2, n))) * self.sigma5 * seasonal * closes
        highs = np.maximum(opens, closes) + wick[0]
        lows = np.minimum(opens, closes) - wick[1]
        vol = np.exp(rng.normal(0, 0.35, n)) * (1 + 40 * np.abs(rets) / self.sigma5 / 10) * seasonal
        return Candles(t, opens, highs, lows, closes, vol * 100.0)

    def _refine(self, c5: Candles) -> Candles:
        """Split each 5m bar into five 1m bars whose aggregate equals the parent exactly."""
        rng = self.rng
        n = len(c5)
        o, h, lo, cl = c5.open, c5.high, c5.low, c5.close
        # random interior closes in [low, high]
        u = rng.random((n, 4))
        inner = lo[:, None] + u * (h - lo)[:, None]
        sub_close = np.concatenate([inner, cl[:, None]], axis=1)
        sub_open = np.concatenate([o[:, None], sub_close[:, :4]], axis=1)
        body_hi = np.maximum(sub_open, sub_close)
        body_lo = np.minimum(sub_open, sub_close)
        span = (h - lo)[:, None]
        sub_high = np.minimum(body_hi + rng.random((n, 5)) * 0.15 * span, h[:, None])
        sub_low = np.maximum(body_lo - rng.random((n, 5)) * 0.15 * span, lo[:, None])
        hi_idx = rng.integers(0, 5, n)
        lo_idx = rng.integers(0, 5, n)
        rows = np.arange(n)
        sub_high[rows, hi_idx] = h
        sub_low[rows, lo_idx] = lo
        w = rng.dirichlet(np.ones(5), n)
        sub_vol = w * c5.volume[:, None]
        t = (c5.time[:, None] + np.arange(5)[None, :] * 60).ravel()
        return Candles(t, sub_open.ravel(), sub_high.ravel(), sub_low.ravel(), sub_close.ravel(), sub_vol.ravel())

    def extend_to(self, now: float) -> None:
        end = int(self.base.time[-1]) + BASE_TF
        if now < end:
            return
        n_new = int((now - end) // BASE_TF) + 1
        new = self._gen_base(end, n_new, float(self.base.close[-1]))
        self.base = _concat(self.base, new)
        self.m1 = _concat(self.m1, self._refine(new))
        keep = REFINE_DAYS * 1440
        if len(self.m1) > keep * 2:
            self.m1 = self.m1.slice(len(self.m1) - keep, len(self.m1))


def _concat(a: Candles, b: Candles) -> Candles:
    return Candles(*(np.concatenate([getattr(a, f), getattr(b, f)]) for f in
                     ("time", "open", "high", "low", "close", "volume")))


def _visible_m1(m1: Candles, now: float) -> Candles:
    """1m bars whose open time <= now; the last bar is shown partially formed."""
    k = int(np.searchsorted(m1.time, now, side="right"))
    v = m1.slice(0, k)
    if k == 0:
        return v
    frac = min(1.0, max(0.0, (now - v.time[-1]) / 60.0))
    if frac >= 1.0:
        return v
    o = v.open[-1]
    c_full = v.close[-1]
    c_now = o + (c_full - o) * frac
    hi = min(v.high[-1], max(o, c_now) + (v.high[-1] - max(o, c_full)) * frac)
    lo_ = max(v.low[-1], min(o, c_now) - (min(o, c_full) - v.low[-1]) * frac)
    close = v.close.copy(); close[-1] = c_now
    high = v.high.copy(); high[-1] = max(hi, o, c_now)
    low = v.low.copy(); low[-1] = min(lo_, o, c_now)
    vol = v.volume.copy(); vol[-1] *= max(frac, 0.01)
    return Candles(v.time, v.open, high, low, close, vol)


class SimulatedProvider(MarketDataProvider):
    name = "simulated"
    is_simulated = True

    def __init__(self, seed: int = 7, clock: Callable[[], float] | None = None):
        self.seed = seed
        self._clock = clock or _time.time
        self._series: dict[str, _SymbolSeries] = {}
        self._lock = threading.Lock()

    def now(self) -> float:
        return self._clock()

    def _get(self, symbol: str) -> _SymbolSeries:
        inst = get_instrument(symbol)
        with self._lock:
            s = self._series.get(inst.symbol)
            now = self.now()
            if s is None:
                seed = self.seed * 1_000 + list(INSTRUMENTS).index(inst.symbol)
                s = _SymbolSeries(inst, seed, now)
                self._series[inst.symbol] = s
            s.extend_to(now)
            return s

    def candles(self, symbol: str, timeframe: str, limit: int = 500) -> Candles:
        tf = TIMEFRAMES[timeframe]
        s = self._get(symbol)
        now = self.now()
        m1 = _visible_m1(s.m1, now)
        if tf < BASE_TF:
            out = aggregate(m1, tf)
        else:
            cur5 = int(now // BASE_TF) * BASE_TF
            k = int(np.searchsorted(s.base.time, cur5, side="left"))
            closed5 = s.base.slice(0, k)
            live5 = aggregate(m1.slice(int(np.searchsorted(m1.time, cur5)), len(m1)), BASE_TF)
            # Only include enough history to satisfy `limit` at this timeframe.
            need = (limit + 2) * (tf // BASE_TF) + (tf // BASE_TF)
            closed5 = closed5.slice(max(0, len(closed5) - need), len(closed5))
            out = aggregate(_concat(closed5, live5), tf)
        return out.slice(max(0, len(out) - limit), len(out))

    def quote(self, symbol: str) -> Quote:
        inst = get_instrument(symbol)
        c = self.candles(symbol, "1m", 30)
        mid = float(c.close[-1])
        # spread widens with short-term volatility and around the daily FX rollover
        rv = float(np.std(np.diff(np.log(c.close)))) if len(c) > 5 else 0.0
        hour = (self.now() % 86400) / 3600
        rollover = 2.5 if 21.0 <= hour < 22.0 and inst.asset_class != "crypto" else 1.0
        spread = inst.typical_spread * rollover * (1.0 + min(3.0, rv / (inst.sim_daily_vol / 38.0) - 1.0) * 0.25)
        spread = max(inst.typical_spread * 0.8, spread)
        return Quote(inst.symbol, mid - spread / 2, mid + spread / 2, mid, spread, self.now(), self.name)


# --------------------------------------------------------------------------------------------
# Binance public market data (crypto only, keyless)
# --------------------------------------------------------------------------------------------

_BINANCE_INTERVALS = {"1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
                      "1h": "1h", "4h": "4h", "1D": "1d"}


class BinancePublicProvider(MarketDataProvider):
    name = "binance_public"
    BASE_URL = "https://api.binance.com"

    def __init__(self, client: httpx.Client | None = None):
        self.client = client or httpx.Client(base_url=self.BASE_URL, timeout=10.0)
        self._last_ts: dict[str, float] = {}

    def _check(self, symbol: str) -> Instrument:
        inst = get_instrument(symbol)
        if inst.asset_class != "crypto":
            raise DataUnavailable(f"{symbol}: Binance public data covers crypto pairs only. "
                                  "Configure a licensed FX/CFD data provider for this instrument.")
        return inst

    def candles(self, symbol: str, timeframe: str, limit: int = 500) -> Candles:
        inst = self._check(symbol)
        try:
            r = self.client.get("/api/v3/klines", params={
                "symbol": inst.symbol, "interval": _BINANCE_INTERVALS[timeframe], "limit": min(limit, 1000)})
            r.raise_for_status()
        except httpx.HTTPError as e:  # never fabricate data on failure
            raise DataUnavailable(f"Binance klines request failed: {e}") from e
        rows = r.json()
        self._last_ts[inst.symbol] = self.now()
        return Candles(
            np.array([int(k[0]) // 1000 for k in rows], dtype=np.int64),
            *(np.array([float(k[j]) for k in rows]) for j in (1, 2, 3, 4, 5)),
        )

    def quote(self, symbol: str) -> Quote:
        inst = self._check(symbol)
        try:
            r = self.client.get("/api/v3/ticker/bookTicker", params={"symbol": inst.symbol})
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise DataUnavailable(f"Binance bookTicker request failed: {e}") from e
        d = r.json()
        bid, ask = float(d["bidPrice"]), float(d["askPrice"])
        return Quote(inst.symbol, bid, ask, (bid + ask) / 2, ask - bid, self.now(), self.name)


_provider: MarketDataProvider | None = None


def get_provider() -> MarketDataProvider:
    global _provider
    if _provider is None:
        from app.config import get_settings

        s = get_settings()
        if s.market_data_provider == "binance_public":
            _provider = BinancePublicProvider()
        else:
            _provider = SimulatedProvider(seed=s.simulated_seed)
    return _provider


def set_provider(p: MarketDataProvider) -> None:
    global _provider
    _provider = p
