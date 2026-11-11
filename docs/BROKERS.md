# Broker compatibility

**Status in this release:** only the **paper simulator** can execute. Every live adapter is `planned` and the
live gate rejects all live orders. The notes below record our current understanding. **Each item must be
re-verified against the broker's official documentation and terms when Phase 3 starts.** Do not treat them as confirmed.

Integration rules (all brokers):
- Only official, documented APIs, connected **server-side**. No screen scraping, no simulated browser clicks, no credentials in the browser.
- Trade-only keys with withdrawals disabled and an IP allow-list where the venue supports it.
- A stop-loss is attached at the venue where supported. Orders carry an idempotency key. Positions are reconciled before any automated action.
- The symbol spec (contract size, step, min qty, trading hours) is read from the venue and overrides `instruments.py`.

| Broker | Planned integration | Current understanding (verify) | Open questions |
|---|---|---|---|
| **Binance** | Official REST + WebSocket API (`python-binance` not required; plain httpx + HMAC signing) | Supports API keys with trading enabled and withdrawals disabled, plus IP restriction. Spot protective exits use STOP_LOSS_LIMIT / OCO. USDⓈ-M futures support STOP_MARKET with reduceOnly. Rate limits are weight-based | Jurisdiction (Binance vs Binance.US). Futures eligibility per user. Current order-type matrix |
| **MetaTrader 5** | `MetaTrader5` Python package in an isolated **mt5-bridge** worker (Windows host with an MT5 terminal logged in) | The package talks to a locally running terminal over IPC. It is not a hosted REST API. `order_send` accepts `sl`/`tp`. `symbol_info` gives contract specs | Terminal hosting and uptime. Credential handling for the terminal login. Broker-specific filling modes |
| **Exness** | Through the MT5 bridge for MT5 accounts | **We do not assume Exness provides a public trading REST API for retail account types.** Exness accounts are typically used through MT4/MT5 terminals | Confirm that automated trading is allowed for the specific account type. Whether MT4-only accounts are supported (they would need a separate MT4 bridge or be excluded) |
| Others | Implement `BrokerAdapter` | — | — |

### Adapter contract (`app/brokers/registry.py`)

`account()`, `place_order(order)` (idempotent on `client_order_id`, must attach SL), `cancel_order()`, `positions()`,
`reconcile()`. An adapter moves to `available` only after integration tests against the venue's sandbox or testnet
pass and the capability matrix has been confirmed.
