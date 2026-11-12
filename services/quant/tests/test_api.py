import os

os.environ["TP_ENV"] = "test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.data.providers import SimulatedProvider, set_provider  # noqa: E402
from tests.conftest import FIXED_NOW  # noqa: E402


@pytest.fixture(scope="module")
def client():
    clock = {"t": FIXED_NOW}
    set_provider(SimulatedProvider(seed=3, clock=lambda: clock["t"]))
    from app.main import create_app
    with TestClient(create_app()) as c:
        yield c


def test_health_and_instruments(client):
    assert client.get("/api/health").json()["simulated_data"] is True
    syms = {i["symbol"] for i in client.get("/api/instruments").json()}
    assert {"BTCUSDT", "XAUUSD", "EURUSD", "USOIL"} <= syms


def test_candles_and_analysis(client):
    r = client.get("/api/candles", params={"symbol": "BTCUSDT", "tf": "15m", "limit": 200}).json()
    assert len(r["candles"]) == 200 and r["simulated"]
    a = client.get("/api/analysis", params={"symbol": "BTCUSDT", "tf": "15m"}).json()
    assert a["drawings"] and a["trend"] in ("bullish", "bearish", "undefined")
    assert client.get("/api/analysis", params={"symbol": "NOPE", "tf": "1h"}).status_code == 404
    assert client.get("/api/analysis", params={"symbol": "BTCUSDT", "tf": "2h"}).status_code == 400


def test_setup_shape(client):
    s = client.get("/api/setup", params={"symbol": "XAUUSD", "tf": "1h"}).json()
    assert s["status"] in ("bullish_setup", "bearish_setup", "neutral", "wait_for_confirmation", "no_trade")
    assert len(s["layers"]) == 7
    assert "confidence" in s and "note" in s["confidence"]


def test_indicator_endpoint(client):
    r = client.post("/api/indicators", json={"symbol": "EURUSD", "timeframe": "1h",
                                              "indicators": [{"name": "rsi"}, {"name": "macd"}]}).json()
    assert {"rsi", "macd", "macd_signal", "macd_hist"} <= set(r["series"])


def test_order_flow_and_journal(client):
    q = client.get("/api/quote", params={"symbol": "BTCUSDT"}).json()
    sl = q["bid"] * 0.99
    r = client.post("/api/risk/position-size", json={"symbol": "BTCUSDT", "entry": q["ask"], "stop_loss": sl}).json()
    o = client.post("/api/orders", json={"symbol": "BTCUSDT", "side": "buy", "qty": r["qty"] * 0.9 // 0.0001 * 0.0001,
                                         "stop_loss": sl, "client_order_id": "t-1"}).json()
    assert o["status"] == "filled", o
    pos = client.get("/api/positions").json()
    assert len(pos) == 1
    closed = client.post(f"/api/positions/{pos[0]['id']}/close").json()
    assert closed["status"] == "closed"
    j = client.get("/api/journal").json()
    assert j["stats"]["trades"] == 1
    client.patch(f"/api/journal/{closed['id']}", json={"notes": "test", "tags": ["a"]})
    assert client.get("/api/journal").json()["trades"][0]["notes"] == "test"


def test_live_mode_denied(client):
    r = client.put("/api/settings/mode", json={"mode": "live", "confirm_phrase": "I UNDERSTAND LIVE TRADING RISKS"})
    assert r.status_code == 403
    assert client.get("/api/settings").json()["mode"] == "paper"


def test_kill_switch_blocks_orders(client):
    client.post("/api/risk/kill-switch", json={"engaged": True, "reason": "test"})
    o = client.post("/api/orders", json={"symbol": "BTCUSDT", "side": "buy", "qty": 0.001, "stop_loss": 1.0}).json()
    assert o["status"] == "rejected"
    client.post("/api/risk/kill-switch", json={"engaged": False})


def test_risk_ceilings(client):
    assert client.put("/api/settings/risk", json={"max_risk_per_trade_pct": 50}).status_code == 400
    assert client.put("/api/settings/strategy", json={"min_confirmations": 1}).status_code == 400


def test_credentials_refuse_withdraw_and_require_vault(client):
    body = {"broker": "binance", "label": "x", "api_key": "k" * 16, "api_secret": "s" * 16,
            "declared_permissions": {"withdraw": True}}
    assert client.post("/api/brokers/credentials", json=body).status_code == 400
    body["declared_permissions"] = {"trade": True, "withdraw": False}
    assert client.post("/api/brokers/credentials", json=body).status_code == 503  # no encryption key configured


def test_backtest_endpoint(client):
    r = client.post("/api/backtest", json={"symbol": "BTCUSDT", "timeframe": "1h", "bars": 800, "mode": "oos"}).json()
    assert "metrics" in r and "out_of_sample" in r and r["equity_curve"]


def test_assistant_en_bn(client):
    a = client.post("/api/assistant/ask", json={"question": "Where is the nearest resistance?", "symbol": "BTCUSDT"}).json()
    assert a["intent"] == "resistance" and a["grounded"]
    b = client.post("/api/assistant/ask", json={"question": "লিকুইডিটি সুইপ দেখাও", "symbol": "BTCUSDT"}).json()
    assert b["language"] == "bn" and b["intent"] == "sweep"
    c = client.post("/api/assistant/ask", json={"question": "Why was this setup rejected?"}).json()
    assert c["intent"] == "rejected"


def test_news_calendar_is_labelled(client):
    n = client.get("/api/news/calendar").json()
    assert all(e["is_simulated"] and e["actual"] is None for e in n["events"])


def test_audit_chain(client):
    assert client.get("/api/audit").json()["chain_valid"] is True


def test_websocket_stream(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"subscribe": {"symbol": "BTCUSDT", "tf": "1m"}})
        msg = ws.receive_json()
        assert msg["type"] == "bar" and msg["symbol"] == "BTCUSDT"


def test_signal_insert_race_is_harmless(client):
    """A duplicate signal for the same bar (e.g. concurrent /scan and /setup) must not fail the request."""
    from app.api.market import _store_signal
    from app.db.models import Signal, session
    db = session()
    res = {"symbol": "ZZTEST", "timeframe": "1h", "status": "neutral", "direction": None, "quality": 0, "bar_time": 1}
    db.add(Signal(symbol="ZZTEST", timeframe="1h", status="neutral", direction=None, quality=0, bar_time=1, payload=res))
    db.commit()
    # simulate the race: the existence check misses because another transaction inserted after it ran
    import app.api.market as m
    orig = m.select
    m.select = lambda *a, **k: orig(Signal).where(Signal.id == -1)
    try:
        _store_signal(db, res)
        db.commit()
    finally:
        m.select = orig
        db.close()
