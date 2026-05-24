"""PredictionMarketClient — read-only client against Polymarket's gamma API.

Returns market metadata (questions, conditionIds, orderbook midpoints) when
POLYMARKET_BASE is set; returns nothing and `use_polymarket=False` otherwise.

This client never invents data — callers (the Pythia daemons) decide whether
absence of markets is fatal. There is no on-chain mock fallback here; opening
positions happens on Arc via PythiaVault.openPosition(), which targets the
real prediction-market adapter address that was deployed as part of the
Arc testnet bring-up.
"""
from __future__ import annotations
import logging
import os
from typing import Optional
import requests

log = logging.getLogger("pythia.polymarket")


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
        except Exception as e:
            log.warning("polymarket list_markets failed: %s", e)
            return []

    def market_for_label(self, label: str) -> Optional[dict]:
        """Heuristic match: find an open market whose question contains `label`."""
        for m in self.list_markets(limit=200):
            if label.lower() in (m.get("question") or "").lower():
                return m
        return None

    def get_book_snapshot(self, market_id: str) -> Optional[float]:
        """Return implied YES probability from the order book midpoint.

        Returns None if Polymarket is unconfigured or the call fails. Callers
        should fall back to "unavailable" in the brain prompt rather than
        treating None as 0.5 — that would silently anchor every forecast to
        the coin-flip prior.
        """
        if not self.use_polymarket:
            return None
        try:
            url = f"{self.base}/markets/{market_id}/orderbook"
            r = requests.get(url, timeout=4)
            r.raise_for_status()
            book = r.json()
            yes_bid = float(book.get("yes", {}).get("bid", 0))
            yes_ask = float(book.get("yes", {}).get("ask", 0))
            if yes_bid > 0 and yes_ask > 0:
                mid = (yes_bid + yes_ask) / 2
                return max(0.0, min(1.0, mid))
            no_bid = float(book.get("no", {}).get("bid", 0))
            if no_bid > 0:
                return max(0.0, min(1.0, 1 - no_bid))
            return None
        except Exception as e:
            log.warning("polymarket get_book_snapshot(%s) failed: %s", market_id, e)
            return None
