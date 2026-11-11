import pytest

from app.db.models import init_db, session
from app.execution.service import submit_order
from app.execution.state import ensure_user
from app.paper.simulator import OrderRequest, PaperBroker
from app.risk.engine import RiskConfig
from tests.fakes import FakeProvider


@pytest.fixture
def env():
    init_db("sqlite:///:memory:")
    db = session()
    _, st, acct = ensure_user(db)
    p = FakeProvider(price=100.0)
    b = PaperBroker(p, latency_ms=0, seed=1)
    cfg = RiskConfig(max_total_exposure_pct=10_000, max_leverage=50)
    yield db, st, acct, p, b, cfg
    db.close()


def buy(b, db, acct, st, cfg, **kw):
    req = OrderRequest(**{"symbol": "BTCUSDT", "side": "buy", "qty": 10.0, "stop_loss": 95.0, "take_profit": 110.0, **kw})
    return b.place_order(db, acct, st, cfg, req)


def test_market_fill_pays_spread_and_fees(env):
    db, st, acct, p, b, cfg = env
    o = buy(b, db, acct, st, cfg)
    assert o.status == "filled"
    assert o.fill_price >= 100.01  # ask + slippage
    assert o.fees == pytest.approx(10 * o.fill_price * 0.001)
    assert acct.balance == pytest.approx(10_000 - o.fees)


def test_duplicate_client_order_id_is_idempotent(env):
    db, st, acct, p, b, cfg = env
    o1 = buy(b, db, acct, st, cfg, client_order_id="abc")
    o2 = buy(b, db, acct, st, cfg, client_order_id="abc")
    assert o1.id == o2.id
    assert len(b.open_positions(db, acct)) == 1


def test_stop_loss_and_take_profit_trigger(env):
    db, st, acct, p, b, cfg = env
    buy(b, db, acct, st, cfg)
    p.price = 94.0
    ev = b.process(db, acct, st, cfg)
    assert any(e.get("event") == "stop_loss" for e in ev)
    pos = b.open_positions(db, acct)
    assert pos == []
    buy(b, db, acct, st, cfg, stop_loss=90.0, take_profit=95.5, client_order_id="tp")
    p.price = 96.0
    ev = b.process(db, acct, st, cfg)
    assert any(e.get("event") == "take_profit" for e in ev)


def test_stale_quote_rejected(env):
    db, st, acct, p, b, cfg = env
    p.t += 120  # quote is now 2 minutes old
    o = buy(b, db, acct, st, cfg)
    assert o.status == "rejected"
    assert any("Quote age" in r for r in o.reject_reasons)


def test_disconnect_rejects_and_never_fabricates(env):
    db, st, acct, p, b, cfg = env
    p.fail = True
    o = buy(b, db, acct, st, cfg)
    assert o.status == "rejected" and "unavailable" in o.reject_reasons[0]


def test_daily_loss_engages_kill_switch(env):
    db, st, acct, p, b, cfg = env
    cfg.max_daily_loss_pct = 0.5
    buy(b, db, acct, st, cfg, stop_loss=50.0, take_profit=None, qty=1.0)
    p.price = 90.0  # -$10 unrealised... too small
    b.process(db, acct, st, cfg)
    assert not st.kill_switch
    p.price = 100.0
    o = buy(b, db, acct, st, cfg, stop_loss=99.0, take_profit=None, qty=10.0, client_order_id="big")
    assert o.status == "filled"
    p.price = 80.0  # gaps through the stop: realised loss far beyond 0.5% of equity
    b.process(db, acct, st, cfg)
    assert st.kill_switch
    o = buy(b, db, acct, st, cfg, client_order_id="after", stop_loss=70.0)
    assert o.status == "rejected"


def test_limit_order_waits_then_fills(env):
    db, st, acct, p, b, cfg = env
    o = buy(b, db, acct, st, cfg, type="limit", limit_price=98.0, stop_loss=95.0)
    assert o.status == "pending"
    p.price = 97.9
    b.process(db, acct, st, cfg)
    assert o.status == "filled"


def test_modes_analysis_and_live_never_route(env):
    db, st, acct, p, b, cfg = env
    req = OrderRequest("BTCUSDT", "buy", 1.0, stop_loss=95.0)
    st.mode = "analysis"
    assert submit_order(db, b, acct, st, cfg, req, None).status == "rejected"
    st.mode = "live"
    o = submit_order(db, b, acct, st, cfg, OrderRequest("BTCUSDT", "buy", 1.0, stop_loss=95.0, client_order_id="l"), None)
    assert o.status == "rejected"
    assert any("TP_LIVE_TRADING_ENABLED" in r for r in o.reject_reasons)
    assert b.open_positions(db, acct) == []
