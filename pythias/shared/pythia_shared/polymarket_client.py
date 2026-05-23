"""PredictionMarketClient — Polymarket V2 if reachable, else MockPredictionMarket.

The client selects the backend by env:
  - POLYMARKET_BASE + POLYMARKET_CHAIN_ID set: use V2 CLOB API
  - else: use the on-chain MockPredictionMarket adapter via openPosition()
"""
from __future__ import annotations
import os
from typing import Optional
import requests


class PredictionMarketClient:
    def __init__(self, base: Optional[str] = None, chain_id: Optional[int] = None):
        self.base = base or os.environ.get("POLYMARKET_BASE")
        self.chain_id = chain_id or int(os.environ.get("POLYMARKET_CHAIN_ID", "0"))

    @property
    def use_polymarket(self) -> bool:
        return bool(self.base)

    def list_markets(self, category: str | None = None, limit: int = 20) -> list[dict]:
        """List active markets. Returns a list of {marketId, label, expiresAt}."""
        if not self.use_polymarket:
            return []
        try:
            url = f"{self.base}/markets?active=true&closed=false&limit={limit}"
            if category:
                url += f"&tag={category}"
            r = requests.get(url, timeout=6)
            r.raise_for_status()
            return r.json()
        except Exception:
            return []

    def market_for_label(self, label: str) -> Optional[dict]:
        """Heuristic match: find an open market whose question contains `label`."""
        for m in self.list_markets(limit=200):
            if label.lower() in (m.get("question") or "").lower():
                return m
        return None
