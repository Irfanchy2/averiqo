"""Broker adapter contracts and the compatibility registry.

Only adapters with ``status == "available"`` can execute. Live adapters are Phase 3 and will be
enabled per broker only after their official API documentation, account-type support and
permission model have been verified (see docs/BROKERS.md). Nothing in this platform automates a
broker's web UI or simulates browser clicks.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class BrokerCapabilities:
    key: str
    name: str
    status: str  # available | planned | not_supported
    integration: str
    asset_classes: list[str]
    supports_server_side_stop_loss: bool
    supports_disable_withdrawals: bool
    official_api: str
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class BrokerAdapter(ABC):
    """Interface every execution venue implements (paper, Binance, MT5 bridge, ...)."""

    capabilities: BrokerCapabilities

    @abstractmethod
    def account(self) -> dict: ...

    @abstractmethod
    def place_order(self, order: dict) -> dict:
        """Must be idempotent on order['client_order_id'] and must attach a stop-loss where supported."""

    @abstractmethod
    def cancel_order(self, order_id: str) -> dict: ...

    @abstractmethod
    def positions(self) -> list[dict]: ...

    @abstractmethod
    def reconcile(self) -> dict:
        """Compare venue state with the local ledger; report and halt on mismatches."""


BROKERS: dict[str, BrokerCapabilities] = {b.key: b for b in [
    BrokerCapabilities(
        "paper", "TradePilot Paper Simulator", "available", "in-process simulator",
        ["crypto", "forex", "metal", "energy"], True, True, "n/a",
        ["Default mode. Realistic spread, latency, slippage and fee modelling."]),
    BrokerCapabilities(
        "binance", "Binance (Spot / USDⓈ-M Futures)", "planned", "Official REST + WebSocket API (server-side)",
        ["crypto"], True, True, "https://developers.binance.com/docs",
        ["API keys can be created with trading enabled and withdrawals disabled; IP allow-listing recommended.",
         "Spot has no native attached stop on market orders — use OCO / STOP_LOSS_LIMIT orders; futures support STOP_MARKET with reduceOnly.",
         "Availability depends on the user's jurisdiction (e.g. Binance.US is a separate venue with its own API).",
         "Verify current rate limits and order types against the official docs before enabling."]),
    BrokerCapabilities(
        "mt5", "MetaTrader 5 (via terminal bridge)", "planned", "Official `MetaTrader5` Python package talking to a running MT5 terminal",
        ["forex", "metal", "energy", "crypto"], True, False, "https://www.mql5.com/en/docs/python_metatrader5",
        ["Requires a MetaTrader 5 terminal (Windows) logged in to the broker account, running on infrastructure you control.",
         "The Python package is a local IPC bridge, not a cloud REST API; deploy as a separate isolated 'mt5-bridge' worker.",
         "SL/TP can be attached to orders (order_send with sl/tp). Symbol specs must be read from symbol_info().",
         "Withdrawal permissions are not part of the MT5 trading login; protect the investor/master passwords accordingly."]),
    BrokerCapabilities(
        "exness", "Exness", "planned", "Via MetaTrader 5 bridge (no general public trading REST API assumed)",
        ["forex", "metal", "energy", "crypto"], True, False, "Use MT5 bridge; confirm with Exness for your account type",
        ["We do NOT assume Exness offers a public trading API for every account type.",
         "Exness accounts are commonly accessed through MT4/MT5 terminals; MT5 accounts can use the MT5 bridge adapter.",
         "Confirm terms of service permit automated trading for your specific account type before enabling."]),
]}
