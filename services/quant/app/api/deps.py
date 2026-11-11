from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.data.providers import get_provider
from app.db.models import session
from app.engine.service import AnalysisService
from app.paper.simulator import PaperBroker

_analysis: AnalysisService | None = None
_broker: PaperBroker | None = None


def get_db() -> Iterator[Session]:
    db = session()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def analysis_service() -> AnalysisService:
    global _analysis
    if _analysis is None or _analysis.p is not get_provider():
        _analysis = AnalysisService(get_provider())
    return _analysis


def paper_broker() -> PaperBroker:
    global _broker
    if _broker is None or _broker.provider is not get_provider():
        _broker = PaperBroker(get_provider())
    return _broker
