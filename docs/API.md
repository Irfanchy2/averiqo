# API reference

The base URL is the quant service, `http://localhost:8000`. The browser reaches it through the Next.js proxy at `/api/*`.
An interactive OpenAPI UI is at `http://localhost:8000/docs`.

**Auth:** if `TP_API_TOKEN` is set, every `/api/*` route except `/api/health` requires
`Authorization: Bearer <token>`, and the WebSocket requires `?token=`. **Rate limit:** `TP_RATE_LIMIT_PER_MINUTE`
per client IP (HTTP 429). All numeric responses are strict JSON: NaN and Inf become `null`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + data provider + `simulated_data` flag |
| `GET` | `/api/instruments` | Instrument specs |
| `GET` | `/api/timeframes` | Timeframes + HTF mapping |
| `GET` | `/api/candles?symbol&tf&limit` | OHLCV (`last_bar_forming` flag) |
| `GET` | `/api/quote?symbol` | Bid/ask/spread/timestamp |
| `GET` | `/api/indicators/catalog` | Indicator definitions |
| `POST` | `/api/indicators` | Compute indicator combinations `{symbol,timeframe,indicators:[{name,params}]}` + volume profile |
| `GET` | `/api/analysis?symbol&tf` | Drawings, trend, HTF bias, indicator snapshot, liquidity, fib, sessions |
| `GET` | `/api/mtf?symbol` | Trend / EMA / RSI / ADX / last break for every timeframe |
| `GET` | `/api/setup?symbol&tf` | Full 7-layer decision with plan, costs, size, calibrated confidence |
| `GET` | `/api/scan?tf` | Decision status across the watchlist |
| `GET` | `/api/signals` | Stored decisions (one per symbol/tf/bar) |
| `GET` | `/api/news/calendar?hours_back&hours_ahead&symbol` | Events + per-asset impact notes |
| `GET` | `/api/news/blackout?symbol` | Is automated entry blocked now? |
| `GET` | `/api/news/impact-guide` | Event → asset transmission guide |
| `POST` | `/api/backtest` | `{symbol,timeframe,bars,params,risk_pct,mode: single\|oos\|walk_forward}` |
| `POST` | `/api/backtest/compare` | Preset variants × regimes |
| `GET` | `/api/settings` | Mode, risk, strategy, preferences, unmet live-trading requirements |
| `PUT` | `/api/settings/mode` | `{mode, confirm_phrase}` (live → 403 with `missing[]`) |
| `PUT` | `/api/settings/risk` | Partial `RiskConfig` (platform ceilings enforced) |
| `PUT` | `/api/settings/strategy` | Partial `StrategyParams` (`min_confirmations ≥ 2`) |
| `PUT` | `/api/settings/preferences` | UI preferences |
| `POST` | `/api/risk/kill-switch` | `{engaged, reason, flatten}` |
| `POST` | `/api/risk/position-size` | `{symbol, entry, stop_loss, risk_pct?}` |
| `GET` | `/api/paper/account` | Balance, equity, daily P&L, exposure, kill switch |
| `POST` | `/api/orders` | `{symbol,side,qty,type,limit_price?,stop_price?,stop_loss,take_profit?,client_order_id,from_setup,timeframe}` → order with `risk_checks[]` |
| `GET` | `/api/orders` | Recent orders |
| `DELETE` | `/api/orders/{id}` | Cancel a pending order |
| `GET` | `/api/positions?status=open\|closed` | Positions with unrealised P&L |
| `PATCH` | `/api/positions/{id}` | Modify SL/TP (SL cannot be removed) |
| `POST` | `/api/positions/{id}/close` | Close at market |
| `POST` | `/api/paper/reset` | Flatten and reset the balance |
| `GET` | `/api/journal` | Closed trades, stats, equity curve, by-symbol |
| `PATCH` | `/api/journal/{id}` | Notes/tags |
| `POST` | `/api/assistant/ask` | `{question, symbol, timeframe, language: en\|bn}` → answer + evidence + chart actions |
| `GET` | `/api/brokers` | Broker capability registry + stored connections (no secrets) |
| `POST` | `/api/brokers/credentials` | Store an encrypted credential (rejects withdrawal-enabled keys) |
| `DELETE` | `/api/brokers/credentials/{id}` | Delete a credential |
| `GET` | `/api/audit` | Audit entries + `chain_valid` |

### WebSocket `/ws`

Client → `{"subscribe": {"symbol": "BTCUSDT", "tf": "1h"}}` / `{"unsubscribe": …}`

Server → `{"type":"bar", symbol, tf, bar, quote, simulated}` every 1 s · `{"type":"bar_closed", symbol, tf, time}` ·
`{"type":"notification", level, title, data}` (stop/target hits, kill switch) · `{"type":"error", message}`.

### Order rejection example

```json
{"status": "rejected",
 "reject_reasons": ["Trade risk 7.34% of equity (limit 1.0%)."],
 "risk_checks": [{"name": "kill_switch", "passed": true, "detail": "Kill switch off."}, …]}
```
