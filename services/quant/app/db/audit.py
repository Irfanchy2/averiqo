from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.jsonutil import clean
from app.db.models import AuditLog


def audit(db: Session, actor: str, action: str, payload: dict) -> AuditLog:
    last = db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(1)).scalar_one_or_none()
    prev = last.hash if last else "0" * 64
    body = clean(payload)
    h = hashlib.sha256((prev + action + json.dumps(body, sort_keys=True, default=str)).encode()).hexdigest()
    row = AuditLog(actor=actor, action=action, payload=body, prev_hash=prev, hash=h)
    db.add(row)
    db.flush()
    return row


def verify_chain(db: Session) -> bool:
    prev = "0" * 64
    for row in db.execute(select(AuditLog).order_by(AuditLog.id)).scalars():
        h = hashlib.sha256((prev + row.action + json.dumps(row.payload, sort_keys=True, default=str)).encode()).hexdigest()
        if row.prev_hash != prev or row.hash != h:
            return False
        prev = row.hash
    return True
