# TradePilot AI

An explainable trading-intelligence platform: automatic market-structure detection and chart
drawings, a seven-layer deterministic decision engine, risk-managed paper trading, and a
look-ahead-free backtester with walk-forward validation.

> **Not a signal service.** TradePilot doesn't promise profits. Every setup shows the reasons for
> and against it, its invalidation conditions and real estimated costs. Confidence is only shown
> when it has been calibrated on at least 30 historical trades. **By default all market data is
> SIMULATED**, and the UI labels it as simulated everywhere.

| | |
|---|---|
| `services/quant` | Python 3.12 · FastAPI · NumPy · SQLAlchemy: structure detection, indicators, decision engine, risk engine, paper broker, backtester, grounded assistant, REST + WebSocket |
| `apps/web` | Next.js 16 · TypeScript · Tailwind 4 · shadcn-style UI · TradingView Lightweight Charts 5: the trading terminal |
| `infra/db/schema.sql` | PostgreSQL DDL |
| `docs/` | Architecture, API, algorithms, risk, licensing, brokers, deployment, roadmap |

## Quick start (local, no Docker)

```bash
# 1) quant service (Python ≥3.11)
cd services/quant
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q                                   # 66 tests
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# 2) web terminal (Node ≥20), in a second shell
cd apps/web
cp .env.example .env.local
npm install
npm run dev                                 # http://localhost:3000
```

Or start the whole stack (PostgreSQL + Redis + both services) with `docker compose up --build`.

## What works in this release (Phase 1 MVP)

- **Market data**: a deterministic, regime-switching simulated feed for 7 instruments (BTC, ETH, XAU, EURUSD, GBPUSD, USDJPY, WTI). All timeframes are aggregated from one base series so they agree with each other. Binance public klines (crypto only) can be enabled with `TP_MARKET_DATA_PROVIDER=binance_public`.
- **Structure engine** (1m–1D): swings HH/HL/LH/LL, BOS/CHoCH, S/R zones, supply/demand, order blocks, FVGs, equal highs/lows, *inferred* BSL/SSL, liquidity sweeps, breakouts and failed breakouts, trendlines and channels, Fibonacci, PDH/PDL/PWH/PWL, and Asia/London/NY session levels. Every drawing has a label, price, timeframe, detection time, reason, quality score and invalidation rule.
- **Indicators**: EMA/SMA, RSI, MACD, VWAP, Supertrend, ATR, Bollinger, ADX/DI, Stoch RSI, OBV, volume profile (bar approximation) and volatility rank. All are causal, which is tested.
- **Decision engine**: 7 layers (HTF bias, structure/zones, liquidity, indicator confluence ≥2, news blackout, execution conditions, net R:R and exposure). It returns one of `bullish_setup | bearish_setup | neutral | wait_for_confirmation | no_trade`, along with entry zone, SL, TP1–3, costs, position size, reasons and invalidation.
- **Risk engine**: kill switch, daily loss, per-trade risk, exposure, leverage, max open trades, spread, slippage, stale prices, mandatory stop-loss and news blackout. All checks run on every order.
- **Paper trading**: bid/ask, latency drift, slippage, fees and commission; market/limit/stop orders with SL/TP; idempotent `client_order_id`; auto kill switch on daily loss; hash-chained audit log.
- **Backtesting**: next-bar fills, conservative intrabar handling, costs, in/out-of-sample split, walk-forward, regime breakdown, quality→outcome calibration, and a full trade list.
- **Assistant**: English and Bengali (বাংলা) Q&A grounded *only* in computed analysis, the calendar and the journal.
- **Terminal UI**: multi-chart workspace (1/2/4), watchlist scanner, setup panel, drawing toggles and hover explanations, order ticket, positions, journal, risk dashboard, calendar, broker registry, settings, notifications, keyboard shortcuts (`?`), mobile layout.

The trading modes are Analysis only, **Paper (default)**, and Live. Live is **hard-disabled** in this release: no broker adapter has been verified yet. See [docs/BROKERS.md](docs/BROKERS.md).

## Docs

- [Architecture & data flow](docs/ARCHITECTURE.md)
- [Algorithms: structure, indicators, decision engine, backtester](docs/ALGORITHMS.md)
- [API reference](docs/API.md)
- [Risk management & security](docs/RISK_AND_SECURITY.md)
- [Data licensing & external dependencies](docs/DATA_LICENSING.md)
- [Broker compatibility](docs/BROKERS.md)
- [Deployment & operations](docs/DEPLOYMENT.md)
- [Roadmap (Phases 2–5, Chrome extension design)](docs/ROADMAP.md)

## Disclaimer

This is educational software. Trading leveraged products carries a high risk of loss. Nothing
here is financial advice. Results on simulated data say nothing about real-market performance.
