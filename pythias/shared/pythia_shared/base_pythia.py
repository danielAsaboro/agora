"""BasePythia — common run-loop. Subclass per Pythia.

Concrete Pythia services override:
  - context_for_market(market) -> str
  - system_prompt() -> str
  - choose_markets() -> list[TargetMarket]
  - decide_position_amount(prob, market) -> int (USDC base units; 0 = skip)

The base implements the run loop:
  1. choose markets
  2. for each, gate on data quality, fetch crowd view + rolling Brier
  3. run two-stage brain (research → forecast)
  4. sign EIP-712 forecast, pin trace to Irys, get traceHash + irys_id
  5. call Registry.emitForecast
  6. optionally open vault position
  7. mirror to /api/forecasts for instant UI
  8. push traction event
"""
from __future__ import annotations
import os
import time
import json
import logging
import requests
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Optional

from .manifest import Manifest, load_manifest, name_hash as _name_hash
from .tradingagents_wrapper import BrainResult, run_brain
from .forecast_signer import ForecastPayload, sign_forecast
from .irys_pin import pin_trace
from .registry_client import RegistryClient
from .polymarket_client import PredictionMarketClient

log = logging.getLogger("pythia")

MIN_CONTEXT_CHARS = 100


class BasePythia(ABC):
    def __init__(self, manifest_path: str | Path):
        self.manifest: Manifest = load_manifest(manifest_path)
        self.name = self.manifest.name
        self.name_hash = _name_hash(self.name)
        self.rpc = os.environ["RPC"]
        self.registry_addr = os.environ["NEXT_PUBLIC_REGISTRY_ADDRESS"]
        upper = self.name.upper()
        self.daemon_pk = os.environ.get(f"{upper}_DAEMON_PK")
        self.circle_wallet_id = os.environ.get(f"{upper}_CIRCLE_WALLET_ID")
        if not self.daemon_pk and not self.circle_wallet_id:
            raise RuntimeError(
                f"No daemon credentials for {self.name}: set "
                f"{upper}_DAEMON_PK (eoa mode) or {upper}_CIRCLE_WALLET_ID "
                f"(circle mode)."
            )
        self.web_base = os.environ.get("AGORA_WEB_BASE", "http://127.0.0.1:3000")
        self.client = RegistryClient(
            self.rpc, self.registry_addr,
            daemon_pk=self.daemon_pk,
            circle_wallet_id=self.circle_wallet_id,
        )
        self.polymarket = PredictionMarketClient()
        self.vault_addr: Optional[str] = None
        self._load_vault_addr()

    def _load_vault_addr(self):
        try:
            row = self.client.get_pythia(self.name_hash)
            self.vault_addr = row[1]  # vault
        except Exception as e:
            log.warning("vault lookup failed for %s: %s", self.name, e)

    # ----- subclass hooks ----------------------------------------------
    @abstractmethod
    def choose_markets(self) -> List[dict]:
        """Return a list of {marketIdHex, label, ...}."""

    def context_for_market(self, market: dict) -> str:
        """Build the prompt context the brain sees. Default: empty."""
        return ""

    def system_prompt(self) -> str:
        return ""

    def decide_position_amount(self, brain: BrainResult, market: dict) -> int:
        """Default position sizing: 10 USDC * confidence."""
        conf = brain.confidence if brain.confidence is not None else 0.5
        return int(10 * conf * 1_000_000)

    # ----- self-calibration ---------------------------------------------
    def _fetch_rolling_brier(self) -> Optional[float]:
        """Pull rolling Brier across the last 10 resolved forecasts from the
        web API. Returns None when there's no resolved history yet (cold
        start) — the brain handles None gracefully."""
        try:
            r = requests.get(
                f"{self.web_base}/api/forecasts",
                params={"pythia": self.name, "resolved": "true", "limit": 10},
                timeout=3,
            )
            r.raise_for_status()
            j = r.json()
            if not j.get("resolvedCount"):
                return None
            return j.get("rollingBrier")
        except Exception as e:
            log.debug("[%s] rolling Brier fetch failed: %s", self.name, e)
            return None

    # ----- run loop -----------------------------------------------------
    def emit_once(self) -> list[str]:
        """Run one pass. Returns list of on-chain tx hashes."""
        tx_hashes: list[str] = []
        markets = self.choose_markets()
        log.info("[%s] %d candidate markets", self.name, len(markets))

        rolling_brier = self._fetch_rolling_brier()
        if rolling_brier is not None:
            log.info("[%s] rolling Brier across last resolved = %.3f", self.name, rolling_brier)

        for market in markets:
            try:
                txh = self._emit_for_market(market, rolling_brier=rolling_brier)
                if txh:
                    tx_hashes.append(txh)
            except Exception as e:
                log.exception("[%s] forecast failed on %s: %s", self.name, market.get("label"), e)
        return tx_hashes

    def _emit_for_market(self, market: dict, *, rolling_brier: Optional[float] = None) -> Optional[str]:
        market_id_hex = market["marketIdHex"]
        if market_id_hex.startswith("0x"):
            market_id = bytes.fromhex(market_id_hex[2:])
        else:
            market_id = bytes.fromhex(market_id_hex)
        ctx = self.context_for_market(market)

        # Data-quality gate: do not emit confident forecasts on zero data.
        # An empty context is a "skip" signal, not a free probability.
        if len(ctx.strip()) < MIN_CONTEXT_CHARS:
            log.warning(
                "[%s] skipping %s: context too thin (%d chars < %d). "
                "Subclass.context_for_market must produce real evidence.",
                self.name, market.get("label"), len(ctx.strip()), MIN_CONTEXT_CHARS,
            )
            return None

        # Fetch the Polymarket book midpoint when we have a polymarket id on
        # the market. None is preserved through to the brain prompt.
        crowd_view: Optional[float] = None
        if pm_id := market.get("polymarketId"):
            crowd_view = self.polymarket.get_book_snapshot(pm_id)
            log.info("[%s] crowd view for %s: %s", self.name, market.get("label"), crowd_view)

        brain = run_brain(
            market_label=market["label"],
            mandate_categories=self.manifest.mandateCategories,
            context=ctx,
            system_prompt=self.system_prompt(),
            rolling_brier=rolling_brier,
            crowd_view=crowd_view,
        )
        log.info(
            "[%s] %s -> prob=%.3f conf=%s",
            self.name, market["label"], brain.prob,
            f"{brain.confidence:.2f}" if brain.confidence is not None else "—",
        )

        trace_payload = json.dumps({
            "pythia": self.name,
            "market": market["label"],
            "marketIdHex": market_id_hex,
            "prob": brain.prob,
            "rationale": brain.rationale,
            "trace": brain.trace,
            "ts": int(time.time()),
        }, sort_keys=True)
        irys_id, trace_hash = pin_trace(
            trace_payload,
            tags=[("App", "agora"), ("Pythia", self.name)],
        )

        prob_scaled = int(brain.prob * 1e18)

        # On-chain emission
        tx_hash = self.client.emit_forecast(self.name_hash, market_id, prob_scaled, trace_hash)
        log.info("[%s] emitForecast tx=%s", self.name, tx_hash)

        # Mirror to web for instant UI — only in EOA mode, where the daemon
        # private key is available to sign the EIP-712 payload the web
        # endpoint verifies. In Circle mode the on-chain ForecastEmitted
        # event is the source of truth and the indexer ingests it directly.
        if self.daemon_pk:
            sig = sign_forecast(
                ForecastPayload(self.name_hash, market_id, prob_scaled, trace_hash),
                self.daemon_pk,
                chain_id=int(os.environ.get("CHAIN_ID", "421614")),
            )
            try:
                requests.post(
                    f"{self.web_base}/api/forecasts",
                    json={
                        "pythiaName": self.name,
                        "nameHashHex": "0x" + self.name_hash.hex(),
                        "marketIdHex": "0x" + market_id.hex(),
                        "prob": str(prob_scaled),
                        "traceHashHex": "0x" + trace_hash.hex(),
                        "traceIrysId": irys_id,
                        "blockNumber": 0,
                        "txHash": tx_hash if tx_hash.startswith("0x") else "0x" + tx_hash,
                        "daemonAddress": self.client.signer.account.address,
                        "daemonSignature": sig if sig.startswith("0x") else "0x" + sig,
                    },
                    timeout=4,
                )
            except Exception as e:
                log.warning("[%s] mirror POST failed: %s", self.name, e)

        # Open vault position. Nonce is derived from the trace hash so an RPC
        # retry of the same forecast intent reuses the same on-chain nonce and
        # the vault's replay guard collapses duplicates into a single position.
        if self.vault_addr:
            amt = self.decide_position_amount(brain, market)
            if amt > 0:
                yes = brain.prob >= 0.5
                try:
                    # The vault's openPosition CPIs into the market adapter, which
                    # rejects markets it hasn't been told about. List the chosen
                    # market on-chain first (idempotent) so the CPI doesn't revert.
                    market_addr = self.client.get_vault_market(self.vault_addr)
                    if self.client.ensure_market_listed(market_addr, market_id, market["label"]):
                        pos_tx = self.client.open_vault_position(
                            self.vault_addr, market_id, yes, amt, prob_scaled
                        )
                        log.info("[%s] openPosition tx=%s amt=%d yes=%s", self.name, pos_tx, amt, yes)
                except Exception as e:
                    log.warning("[%s] openPosition failed: %s", self.name, e)

        return tx_hash

    def run_forever(self, interval_sec: int = 3600):
        while True:
            try:
                self.emit_once()
            except KeyboardInterrupt:
                return
            except Exception:
                log.exception("[%s] loop iteration crashed", self.name)
            time.sleep(interval_sec)
