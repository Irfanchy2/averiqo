# Risk management & security

## Pre-trade risk checks (`app/risk/engine.py`)

Every order runs **all** checks below, in paper mode and in any future live mode. Results are stored on the order and written to the audit log.

| Check | Default | Notes |
|---|---|---|
| Kill switch | off | Manual from the top bar or Risk page. Turned on automatically when the daily loss limit is hit. Engaging it cancels pending orders and can optionally flatten positions |
| Stale price | 30 s | Quote age. Layer 6 also blocks setups on stale bars |
| Quantity | instrument min/step | Rounded down, never up |
| Mandatory stop-loss | on (cannot be disabled in UI) | Must be on the correct side of price. It cannot be removed from an open position |
| Max risk per trade | 1 % of equity | Uses stop distance × contract size × FX conversion |
| Max daily loss | 3 % | Realised today + unrealised |
| Max total exposure | 300 % of equity | Sum of notionals |
| Max leverage | min(10×, instrument max) | |
| Max simultaneous trades | 3 | |
| Max spread | 25 % of ATR | |
| Max slippage | 15 bps | The simulated fill is rejected if slippage exceeds this |
| News blackout | ±30 min around high-impact events for the instrument | |

Platform ceilings that settings cannot exceed: 5 % per trade, 20 % daily loss, 50× leverage, and `min_confirmations ≥ 2`.

**Duplicate-order prevention:** orders carry a client-generated `client_order_id`. A unique `(account_id, client_order_id)` constraint plus a lookup before insert makes retries idempotent.
**Disconnect protection:** if a quote is unavailable, orders are rejected and SL/TP processing skips the position without making anything up. In live mode, broker-side stops are mandatory so positions stay protected while the platform is offline.
**Reconciliation:** the `BrokerAdapter.reconcile()` contract exists for Phase 3. Any mismatch between the venue and the local ledger will halt automation.

## Security

| Area | Implementation |
|---|---|
| Authentication | Phase 1 is single-tenant: an optional bearer token (`TP_API_TOKEN`) on all API routes and the WS. The Next.js proxy adds the token server-side, so the browser never sees it. Multi-user auth (OIDC, e.g. Auth0 or Keycloak, with httpOnly session cookies) is a Phase 5 item, and the DB already has a `users` table |
| Broker credentials | Fernet (AES-128-CBC + HMAC) with a key from `TP_CREDENTIALS_ENCRYPTION_KEY` (use a secrets manager or KMS in production). Never returned by the API. Only a fingerprint is shown. Storage is refused if no key is configured |
| Least privilege | Keys that declare withdrawal permission are rejected. The docs require trade-only keys with IP allow-lists. The DB role should not have UPDATE/DELETE on `audit_log` |
| Audit | Append-only, SHA-256 hash-chained `audit_log`. `/api/audit` reports `chain_valid` |
| Rate limiting | Per-IP sliding window (HTTP 429). Move to Redis when there are multiple replicas |
| Transport/headers | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. CORS is restricted to `TP_CORS_ORIGINS`. Terminate TLS at the reverse proxy |
| Browser storage | Only UI preferences (layout, colours, language) go in `localStorage`. No secrets |
| Chrome extension (Phase 4) | Will never read or store credentials, automate TradingView or broker UIs, or place orders. It only displays analysis fetched from the backend with a scoped, read-only token |
| Containers | Non-root users. Ports bound to 127.0.0.1 in compose |
| Live trading | Blocked unless `TP_LIVE_TRADING_ENABLED=true` (server), the user's typed opt-in, a verified credential, a verified adapter and no kill switch are all present. No adapter is verified in this release |
