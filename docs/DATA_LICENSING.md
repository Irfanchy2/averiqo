# External dependencies, data licensing & limitations

TradePilot **never fabricates prices, news or economic figures.** If real data is unavailable, it shows
simulated data with a clear label, or an explicit error.

## Market data

| Source | Status | Licensing notes |
|---|---|---|
| Simulated feed (`simulated`) | Default | Synthetic and deterministic. Labelled **SIMULATED** in the API (`simulated: true`) and the UI. Instrument base prices are arbitrary starting points, not quotes |
| Binance public REST (`binance_public`) | Implemented, crypto only, opt-in | Keyless market-data endpoints (`/api/v3/klines`, `/api/v3/ticker/bookTicker`). Subject to Binance API Terms of Use and regional availability. Redistributing to third parties may need permission |
| FX / metals / energy real-time | **Not configured** | Needs a licensed feed (for example the broker's own MT5 feed for the account holder, or a commercial vendor). Exchange and vendor terms usually restrict display and redistribution. Review the licence before showing data to other users |
| TradingView | Not used as a data source | Lightweight Charts (Apache-2.0) is a rendering library only. Its attribution logo stays enabled as the licence requires. The Phase 4 extension will not scrape TradingView data |

## News & economic calendar

The current provider is a `DemoScheduleProvider` that produces a **recurring template** (NFP first Friday, CPI mid-month, EIA Wednesdays,
and so on). The dates are approximate and there are **no actual, forecast or previous values**. Every event is flagged `is_simulated` and the UI
shows a disclaimer. For production, implement `CalendarProvider` with a licensed source, such as a commercial economic-calendar
API, official central-bank and statistics-agency release schedules (Fed, BLS, BEA, ECB, EIA, OPEC), or a licensed newswire
for geopolitical and crypto-incident coverage. Check each provider's terms for caching and redistribution.

## AI / LLM

Phase 1 uses a deterministic, grounded assistant and needs no external AI service. A Phase 2 LLM layer
(for example Claude through the Anthropic API) may only rephrase grounded facts. Prompts must not include user PII or
credentials.

## Libraries

FastAPI, NumPy, SQLAlchemy, Pydantic, httpx, cryptography (BSD/MIT/Apache) · Next.js, React, Tailwind CSS,
lucide-react, class-variance-authority (MIT) · Lightweight Charts (Apache-2.0, attribution required).
