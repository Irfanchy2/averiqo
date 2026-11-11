"""TradePilot AI — quantitative services (FastAPI)."""
from __future__ import annotations

import asyncio
import contextlib
import hmac
import logging
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import market, trading
from app.api.deps import paper_broker
from app.config import get_settings
from app.core.types import TIMEFRAMES
from app.data.instruments import get_instrument
from app.data.providers import DataUnavailable, get_provider
from app.db.models import init_db, session
from app.execution.state import ensure_user, risk_config

log = logging.getLogger("tradepilot")


class Hub:
    """In-process pub/sub for WebSocket clients (swap for Redis pub/sub when scaling horizontally)."""

    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def broadcast(self, msg: dict):
        dead = []
        for ws in self.clients:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


hub = Hub()


async def paper_loop():
    while True:
        try:
            db = session()
            try:
                _, st, acct = ensure_user(db)
                events = paper_broker().process(db, acct, st, risk_config(st))
                db.commit()
            finally:
                db.close()
            for e in events:
                await hub.broadcast({"type": "notification", "level": "warning" if e["event"] == "kill_switch" else "info",
                                     "title": e["event"].replace("_", " ").title(), "data": e})
        except Exception as e:  # keep the loop alive; surface via logs
            log.exception("paper loop error: %s", e)
        await asyncio.sleep(1.0)


def create_app() -> FastAPI:
    s = get_settings()
    init_db(s.database_url)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(paper_loop()) if s.env != "test" else None
        yield
        if task:
            task.cancel()

    app = FastAPI(title="TradePilot AI — Quant Services", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
                       allow_methods=["*"], allow_headers=["*"])

    buckets: dict[str, deque] = defaultdict(deque)

    @app.middleware("http")
    async def security(request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/") and path != "/api/health":
            if s.api_token:
                auth = request.headers.get("authorization", "")
                if not hmac.compare_digest(auth, f"Bearer {s.api_token}"):
                    return JSONResponse({"detail": "unauthorized"}, status_code=401)
            ip = request.client.host if request.client else "?"
            q, now = buckets[ip], time.monotonic()
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= s.rate_limit_per_minute:
                return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "10"})
            q.append(now)
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        return resp

    app.include_router(market.router)
    app.include_router(trading.router)

    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        if s.api_token and not hmac.compare_digest(websocket.query_params.get("token", ""), s.api_token):
            await websocket.close(code=4401)
            return
        await websocket.accept()
        hub.clients.add(websocket)
        subs: set[tuple[str, str]] = set()
        last_closed: dict[tuple[str, str], int] = {}

        async def reader():
            while True:
                msg = await websocket.receive_json()
                if "subscribe" in msg:
                    sym = get_instrument(msg["subscribe"]["symbol"]).symbol
                    tf = msg["subscribe"].get("tf", "1h")
                    if tf in TIMEFRAMES:
                        subs.add((sym, tf))
                if "unsubscribe" in msg:
                    subs.discard((msg["unsubscribe"]["symbol"].upper(), msg["unsubscribe"].get("tf", "1h")))

        rtask = asyncio.create_task(reader())
        try:
            p = get_provider()
            while not rtask.done():
                for sym, tf in list(subs):
                    try:
                        c = p.candles(sym, tf, 2)
                        q = p.quote(sym)
                    except DataUnavailable as e:
                        await websocket.send_json({"type": "error", "symbol": sym, "message": str(e)})
                        continue
                    bar = c.to_records()[-1]
                    await websocket.send_json({"type": "bar", "symbol": sym, "tf": tf, "bar": bar,
                                               "quote": q.to_dict(), "simulated": p.is_simulated})
                    closed_t = int(c.time[-2]) if len(c) > 1 else 0
                    if last_closed.get((sym, tf)) not in (None, closed_t):
                        await websocket.send_json({"type": "bar_closed", "symbol": sym, "tf": tf, "time": closed_t})
                    last_closed[(sym, tf)] = closed_t
                await asyncio.sleep(1.0)
        except WebSocketDisconnect:
            pass
        finally:
            rtask.cancel()
            hub.clients.discard(websocket)

    return app


app = create_app()
