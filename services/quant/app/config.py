"""Runtime configuration (12-factor; every value overridable via environment)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TP_", env_file=".env", extra="ignore")

    env: str = "development"
    # sqlite for zero-setup local dev; postgres in docker/prod:
    # postgresql+psycopg://tradepilot:tradepilot@localhost:5432/tradepilot
    database_url: str = "sqlite:///./tradepilot.db"
    redis_url: str | None = None

    # "simulated" (default, clearly labelled) or "binance_public" (Binance public REST klines,
    # crypto only, subject to Binance terms of use).
    market_data_provider: str = "simulated"
    simulated_seed: int = 7

    # Optional bearer token protecting the API. Empty = dev mode (bind to localhost only!).
    api_token: str = ""
    rate_limit_per_minute: int = 600
    cors_origins: str = "http://localhost:3000"

    # Fernet key (urlsafe base64, 32 bytes) for broker credential encryption at rest.
    credentials_encryption_key: str = ""

    # Hard server-side switch. Live trading can never be enabled from the UI while this is false.
    live_trading_enabled: bool = False

    paper_starting_balance: float = 10_000.0
    stale_price_seconds: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
