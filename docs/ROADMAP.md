# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 — MVP | Dashboard, chart engine, structure detection and drawings, indicators, decision engine, risk engine, paper trading, backtesting (incl. walk-forward), grounded EN/BN assistant, journal | ✅ this release |
| 2 — AI & news | Licensed calendar/news `CalendarProvider`; historical calendar so backtests can apply L5; optional LLM explanation layer limited to grounded facts; push/email signal notifications; Redis pub/sub | planned |
| 3 — Brokers | Binance adapter (testnet first), MT5 bridge worker, Exness via MT5 after verification; reconciliation; live/paper ledger separation; venue-side stops; chaos tests for disconnects | planned |
| 4 — Chrome extension | TradingView companion (design below) | planned |
| 5 — Production | OIDC multi-user auth, per-user tenancy, Redis rate limits, metrics/tracing, load tests, pen test, IaC deploy | planned |

## Chrome extension design (Phase 4)

- Manifest V3. `host_permissions` limited to `https://www.tradingview.com/chart/*` and the TradePilot API origin.
- The content script reads only the **symbol and timeframe from the page URL/title**. It does not read the DOM's price data, cookies or credentials.
- It shows a floating panel (shadow DOM) with trend, nearest S/R, liquidity pools and the current setup from `GET /api/analysis` and `/api/setup`. Auth uses a **scoped read-only token** obtained by logging in to the web app (OAuth device-code style). The token is stored in `chrome.storage.session`.
- Overlays: an absolutely positioned layer that marks price levels **only if** they can be placed without modifying TradingView's
  canvas or breaching its terms. Otherwise the panel lists levels as text. No automation of TradingView or broker UIs. No order placement.
- "Open in TradePilot" deep-links into the web workspace for full drawings and trading.
