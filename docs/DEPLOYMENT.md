# Deployment & operations

## Local

See the root README. The defaults are SQLite and the simulated feed. No external services are needed.

## Docker Compose

```bash
cp services/quant/.env.example .env      # set TP_API_TOKEN and TP_CREDENTIALS_ENCRYPTION_KEY
docker compose up --build                # web :3000, API :8000 (both bound to 127.0.0.1)
```

## Production checklist

1. **TLS reverse proxy** (Caddy, nginx or a cloud load balancer) in front of `web`. Route `/ws` to the quant service and terminate TLS there.
   Set `NEXT_PUBLIC_QUANT_WS_URL=wss://<host>/ws` at build time.
2. **Secrets** from a manager (AWS Secrets Manager, GCP Secret Manager, Vault): `TP_API_TOKEN`, `TP_CREDENTIALS_ENCRYPTION_KEY`, DB password.
3. **PostgreSQL** with backups and PITR. Apply `infra/db/schema.sql` or let the service create the tables.
   Revoke `UPDATE`/`DELETE` on `audit_log` from the app role.
4. **Single quant worker** (in-process paper loop and WS hub). To scale, see ARCHITECTURE → Scaling notes.
5. **Keep `TP_LIVE_TRADING_ENABLED=false`** until the Phase 3 adapter verification and a security review are done.
6. **Monitoring:** scrape `/api/health`, alert on non-200 and on the `kill_switch.auto` audit action, and ship JSON logs.
   Watch data freshness (quote age) per instrument.
7. **CI** (`.github/workflows/ci.yml`): ruff + pytest for the quant service; eslint + tsc + build for the web app.

## Runbook

| Situation | Action |
|---|---|
| Data feed down | Orders are rejected automatically (`Market data unavailable`). Setups show an error. Check provider status. No action is needed for open paper positions. |
| Daily loss hit | The kill switch engages automatically. Review the journal and release it manually from the Risk page the next day. |
| Suspected compromise | Engage the kill switch with flatten, rotate `TP_API_TOKEN`, delete broker credentials, rotate exchange keys at the venue, and check `/api/audit` → `chain_valid`. |
| Audit chain invalid | Treat as tampering. Freeze the DB and investigate from backups. |
