import pytest

from app.data.instruments import get_instrument
from app.risk.engine import (
    AccountState,
    MarketState,
    OrderIntent,
    RiskConfig,
    position_size,
    validate,
)

BTC = get_instrument("BTCUSDT")
GOLD = get_instrument("XAUUSD")


def mkt(**kw):
    d = dict(bid=99.99, ask=100.01, quote_age_s=1.0, atr=1.0)
    d.update(kw)
    return MarketState(**d)


def acct(**kw):
    d = dict(equity=10_000, open_positions=[], daily_pnl=0.0)
    d.update(kw)
    return AccountState(**d)


def failed(dec):
    return {c["name"] for c in dec.checks if not c["passed"]}


def test_position_size_respects_risk():
    ps = position_size(BTC, 10_000, 1.0, 100.0, 98.0)
    assert ps["qty"] == pytest.approx(50.0)
    assert ps["risk_amount"] == pytest.approx(100.0)


def test_position_size_rounds_down_to_lot_step():
    ps = position_size(GOLD, 10_000, 1.0, 2350.0, 2340.0)  # $10 * 100oz per lot = $1000/lot
    assert ps["qty"] == pytest.approx(0.1)
    assert ps["risk_amount"] <= 100.0 + 1e-9


def test_approves_well_formed_order():
    d = validate(OrderIntent("BTCUSDT", "buy", 10.0, 100.0, 95.0), BTC, acct(), mkt(), RiskConfig(max_total_exposure_pct=1000))
    assert d.approved, d.reasons()


def test_mandatory_stop_loss():
    d = validate(OrderIntent("BTCUSDT", "buy", 1.0, 100.0, None), BTC, acct(), mkt(), RiskConfig())
    assert "stop_loss" in failed(d)
    d = validate(OrderIntent("BTCUSDT", "buy", 1.0, 100.0, 105.0), BTC, acct(), mkt(), RiskConfig())
    assert "stop_loss" in failed(d)  # wrong side


def test_stale_price_blocks():
    d = validate(OrderIntent("BTCUSDT", "buy", 1.0, 100.0, 95.0), BTC, acct(), mkt(quote_age_s=120), RiskConfig())
    assert "stale_price" in failed(d)


def test_kill_switch_blocks():
    d = validate(OrderIntent("BTCUSDT", "buy", 1.0, 100.0, 95.0), BTC, acct(kill_switch=True), mkt(), RiskConfig())
    assert not d.approved and "kill_switch" in failed(d)


def test_daily_loss_blocks():
    d = validate(OrderIntent("BTCUSDT", "buy", 1.0, 100.0, 95.0), BTC, acct(daily_pnl=-400), mkt(), RiskConfig())
    assert "daily_loss" in failed(d)


def test_exposure_leverage_and_open_trades():
    pos = [{"notional": 30_000}] * 3
    d = validate(OrderIntent("BTCUSDT", "buy", 100.0, 100.0, 99.9), BTC, acct(open_positions=pos), mkt(), RiskConfig())
    assert {"total_exposure", "leverage", "open_trades"} <= failed(d)


def test_spread_and_news():
    d = validate(OrderIntent("BTCUSDT", "buy", 1.0, 100.0, 95.0), BTC, acct(),
                 mkt(bid=99.0, ask=101.0, news_blackout={"active": True, "reason": "CPI"}), RiskConfig())
    assert {"spread", "news_blackout"} <= failed(d)


def test_all_checks_reported_even_when_failing_early():
    d = validate(OrderIntent("BTCUSDT", "buy", 1.0, 100.0, None), BTC, acct(kill_switch=True), mkt(), RiskConfig())
    assert len(d.checks) >= 8
