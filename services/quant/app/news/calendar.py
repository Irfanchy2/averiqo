"""Economic calendar & event-risk.

No licensed news/calendar feed is configured by default, so ``DemoScheduleProvider`` produces a
*recurring-schedule template* of well-known releases (e.g. NFP on the first Friday). These
events are flagged ``is_simulated=True`` / source "DEMO schedule" and carry NO actual, forecast or
previous values — we never fabricate figures. Dates are approximations of the usual cadence and
MUST NOT be relied upon for trading. Configure a licensed provider (see docs/DATA_LICENSING.md)
for production use; implement ``CalendarProvider`` for it.
"""
from __future__ import annotations

import datetime as dt
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass

from app.data.instruments import get_instrument

# How each event category typically transmits to major instruments. Educational, not predictive.
EVENT_IMPACT_GUIDE: dict[str, dict[str, str]] = {
    "CPI": {
        "BTC": "Hotter-than-expected inflation tends to lift rate expectations and the USD, which has often pressured BTC; a cooler print can support risk assets.",
        "GOLD": "Gold is sensitive to real yields: a hot CPI that lifts yields/USD often weighs on gold short-term, though inflation-hedge demand can offset it.",
        "OIL": "Indirect: CPI shifts USD and growth expectations; energy is itself a CPI component.",
        "FX": "Directly moves USD pairs via rate expectations — high volatility and wide spreads around the release.",
    },
    "FOMC": {
        "BTC": "Rate decisions and guidance move liquidity expectations; hawkish surprises have historically weighed on crypto.",
        "GOLD": "Hawkish = higher real yields/USD, usually negative for gold; dovish the opposite.",
        "OIL": "Through USD and demand/growth expectations.",
        "FX": "Primary driver of USD; statement and press conference can cause two-way volatility.",
    },
    "NFP": {
        "BTC": "Strong jobs data can push yields and USD higher; reaction is often short-lived but volatile.",
        "GOLD": "Strong payrolls typically pressure gold via yields/USD.",
        "OIL": "Read as a demand/growth signal; secondary effect.",
        "FX": "One of the most volatile scheduled USD events; spreads widen materially.",
    },
    "UNEMPLOYMENT": {
        "BTC": "Weaker labour data raises odds of easier policy — mixed for risk assets.",
        "GOLD": "Rising unemployment can support gold through lower expected rates.",
        "OIL": "Weaker labour market implies softer demand.",
        "FX": "Moves the currency of the releasing economy.",
    },
    "RATE_DECISION": {
        "BTC": "Global liquidity conditions matter for crypto risk appetite.",
        "GOLD": "Higher policy rates raise the opportunity cost of holding gold.",
        "OIL": "Via growth outlook and currency.",
        "FX": "Directly reprices the issuing central bank's currency.",
    },
    "GDP": {
        "BTC": "Growth surprises shift risk appetite.",
        "GOLD": "Strong growth can reduce safe-haven demand.",
        "OIL": "Higher growth implies stronger energy demand.",
        "FX": "Moves the issuing economy's currency.",
    },
    "OIL_INVENTORIES": {
        "BTC": "Little direct effect.",
        "GOLD": "Little direct effect.",
        "OIL": "Larger-than-expected builds are typically bearish for crude, draws bullish.",
        "FX": "Can affect commodity currencies (CAD, NOK).",
    },
    "OPEC": {
        "BTC": "Little direct effect.",
        "GOLD": "Indirect via inflation expectations.",
        "OIL": "Production quota decisions directly move crude supply expectations.",
        "FX": "Commodity currencies react.",
    },
    "CRYPTO_REGULATION": {
        "BTC": "Regulatory actions or approvals can cause sharp repricing and liquidity changes.",
        "GOLD": "No direct effect.", "OIL": "No direct effect.", "FX": "No direct effect.",
    },
}

ASSET_KEY = {"crypto": "BTC", "metal": "GOLD", "energy": "OIL", "forex": "FX"}


@dataclass
class EconomicEvent:
    id: str
    title: str
    category: str
    country: str
    currency_tags: list[str]
    time: int  # unix seconds UTC
    importance: str  # high | medium | low
    source: str
    is_simulated: bool
    actual: str | None = None
    forecast: str | None = None
    previous: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


class CalendarProvider(ABC):
    name = "abstract"

    @abstractmethod
    def events(self, start: int, end: int) -> list[EconomicEvent]: ...


class DemoScheduleProvider(CalendarProvider):
    name = "demo_schedule"
    SOURCE = "DEMO schedule (recurring template — not a live feed)"

    def events(self, start: int, end: int) -> list[EconomicEvent]:
        out: list[EconomicEvent] = []
        d0 = dt.datetime.fromtimestamp(start, dt.timezone.utc).date() - dt.timedelta(days=1)
        d1 = dt.datetime.fromtimestamp(end, dt.timezone.utc).date() + dt.timedelta(days=1)
        d = d0
        while d <= d1:
            def at(h: int, m: int = 0) -> int:
                return int(dt.datetime(d.year, d.month, d.day, h, m, tzinfo=dt.timezone.utc).timestamp())

            def ev(key, title, cat, ctry, tags, ts, imp):
                out.append(EconomicEvent(f"demo-{key}-{d.isoformat()}", title, cat, ctry, tags, ts, imp, self.SOURCE, True))

            wd = d.weekday()
            if wd == 4 and d.day <= 7:
                ev("nfp", "US Nonfarm Payrolls", "NFP", "US", ["USD", "GOLD", "CRYPTO"], at(12, 30), "high")
                ev("ur", "US Unemployment Rate", "UNEMPLOYMENT", "US", ["USD", "GOLD"], at(12, 30), "high")
            if 10 <= d.day <= 14 and wd == 2:
                ev("cpi", "US CPI (MoM / YoY)", "CPI", "US", ["USD", "GOLD", "CRYPTO", "OIL"], at(12, 30), "high")
            if wd == 2:
                ev("eia", "EIA Crude Oil Inventories", "OIL_INVENTORIES", "US", ["OIL"], at(14, 30), "medium")
            if wd == 3:
                ev("claims", "US Initial Jobless Claims", "UNEMPLOYMENT", "US", ["USD"], at(12, 30), "medium")
            if wd == 2 and 15 <= d.day <= 21 and d.month in (1, 3, 5, 6, 7, 9, 10, 12):
                ev("fomc", "FOMC Rate Decision & Statement", "FOMC", "US", ["USD", "GOLD", "CRYPTO", "OIL"], at(18, 0), "high")
            if wd == 3 and 8 <= d.day <= 14 and d.month in (1, 3, 4, 6, 7, 9, 10, 12):
                ev("ecb", "ECB Interest Rate Decision", "RATE_DECISION", "EU", ["EUR"], at(12, 15), "high")
            if wd == 3 and 25 <= d.day <= 31 and d.month in (1, 4, 7, 10):
                ev("gdp", "US GDP (Advance)", "GDP", "US", ["USD"], at(12, 30), "high")
            if d.day == 1 and d.month in (6, 12):
                ev("opec", "OPEC+ Ministerial Meeting", "OPEC", "INTL", ["OIL"], at(12, 0), "high")
            d += dt.timedelta(days=1)
        return sorted([e for e in out if start <= e.time <= end], key=lambda e: e.time)


def events_for_symbol(events: list[EconomicEvent], symbol: str) -> list[EconomicEvent]:
    tags = set(get_instrument(symbol).news_currencies)
    return [e for e in events if tags & set(e.currency_tags)]


def impact_explanation(event: EconomicEvent, symbol: str) -> str:
    key = ASSET_KEY[get_instrument(symbol).asset_class]
    return EVENT_IMPACT_GUIDE.get(event.category, {}).get(key, "No well-established direct transmission channel.")


def blackout_status(events: list[EconomicEvent], symbol: str, now: float,
                    before_min: int = 30, after_min: int = 30) -> dict:
    """Is `symbol` inside a high-impact news window? New automated entries are blocked if so."""
    rel = [e for e in events_for_symbol(events, symbol) if e.importance == "high"]
    for e in rel:
        if e.time - before_min * 60 <= now <= e.time + after_min * 60:
            return {"active": True, "event": e.to_dict(), "until": e.time + after_min * 60,
                    "reason": f"High-impact event '{e.title}' within the ±{before_min}/{after_min} min window."}
    upcoming = [e for e in rel if e.time > now]
    return {"active": False, "next_event": upcoming[0].to_dict() if upcoming else None}


_calendar: CalendarProvider = DemoScheduleProvider()


def get_calendar() -> CalendarProvider:
    return _calendar
