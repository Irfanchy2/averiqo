"""Encrypted broker-credential storage (Fernet / AES-128-CBC + HMAC-SHA256).

Secrets are encrypted server-side with a key from the environment (or a secrets manager in
production) and are never returned by any API endpoint. The browser extension never sees them.
"""
from __future__ import annotations

import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


class VaultNotConfigured(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = get_settings().credentials_encryption_key
    if not key:
        raise VaultNotConfigured("TP_CREDENTIALS_ENCRYPTION_KEY is not set; refusing to store broker credentials.")
    return Fernet(key.encode())


def encrypt(secret: dict) -> tuple[str, str]:
    raw = json.dumps(secret, sort_keys=True).encode()
    fp = hashlib.sha256(raw).hexdigest()[:12]
    return _fernet().encrypt(raw).decode(), fp


def decrypt(ciphertext: str) -> dict:
    try:
        return json.loads(_fernet().decrypt(ciphertext.encode()))
    except InvalidToken as e:
        raise VaultNotConfigured("Credential decryption failed (wrong key?)") from e
