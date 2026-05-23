"""Shared library for all Agora Pythia services.

A Pythia is a daemon that:
  1. Wakes on a schedule, looks at its mandate's data sources.
  2. Calls the TradingAgents brain (or any structured-output LLM) to produce
     a `prob: float in [0,1]` and a reasoning `trace: str`.
  3. Pins the trace to Irys, hashes it, signs an EIP-712 Forecast payload,
     and calls Registry.emitForecast.
  4. Opens a position on the target market with `builderCode = vault address`,
     so fees + PnL flow back into the vault.
"""

from .manifest import Manifest, load_manifest, save_manifest, manifest_hash, mandate_root, name_hash
from .forecast_signer import sign_forecast, ForecastPayload
from .irys_pin import pin_trace
from .registry_client import RegistryClient
from .polymarket_client import PredictionMarketClient

__all__ = [
    "Manifest",
    "load_manifest",
    "save_manifest",
    "manifest_hash",
    "mandate_root",
    "name_hash",
    "sign_forecast",
    "ForecastPayload",
    "pin_trace",
    "RegistryClient",
    "PredictionMarketClient",
]
