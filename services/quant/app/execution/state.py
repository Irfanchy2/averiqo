"""Helpers to load the (single-tenant MVP) user, settings and paper account."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import PaperAccount, TradingSettings, User
from app.engine.decision import StrategyParams
from app.risk.engine import RiskConfig

DEFAULT_USER_ID = 1


def ensure_user(db: Session, user_id: int = DEFAULT_USER_ID) -> tuple[User, TradingSettings, PaperAccount]:
    u = db.get(User, user_id)
    if u is None:
        u = User(id=user_id, email="local@tradepilot.dev")
        db.add(u)
        db.flush()
    st = db.get(TradingSettings, user_id)
    if st is None:
        st = TradingSettings(user_id=user_id, mode="paper", risk_config=RiskConfig().to_dict(),
                             strategy_params=StrategyParams().to_dict(),
                             preferences={"language": "en", "colors": {}})
        db.add(st)
    acct = db.execute(select(PaperAccount).where(PaperAccount.user_id == user_id)).scalar_one_or_none()
    if acct is None:
        bal = get_settings().paper_starting_balance
        acct = PaperAccount(user_id=user_id, starting_balance=bal, balance=bal)
        db.add(acct)
    db.flush()
    return u, st, acct


def risk_config(st: TradingSettings) -> RiskConfig:
    return RiskConfig.from_dict(st.risk_config)


def strategy_params(st: TradingSettings) -> StrategyParams:
    return StrategyParams.from_dict(st.strategy_params)
