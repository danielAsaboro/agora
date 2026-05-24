"""Cassandra — bear-bias crypto Pythia.

Data: Coingecko prices, DeFiLlama TVL / borrows, Coinglass liquidations.
Default: free public endpoints; configure keys for production.
"""
from __future__ import annotations
import re
import requests
from typing import List
from pythia_shared.base_pythia import BasePythia
from pythia_shared.tradingagents_wrapper import BrainResult
from pythia_shared.polymarket_client import PredictionMarketClient
from eth_utils import keccak


class CassandraPythia(BasePythia):
    def __init__(self, manifest_path: str):
        super().__init__(manifest_path)
        self.market_client = PredictionMarketClient()

    def system_prompt(self) -> str:
        return (
            "You are Cassandra. Your edge is bear-side discipline: you forecast\n"
            "drawdowns, liquidations, depegs, exchange insolvencies. You are NOT\n"
            "perma-bearish — you're calibrated, but you watch the things that\n"
            "break. Stay within crypto-downside or 25% of your bond burns."
        )

    CRYPTO_KEYWORDS = (
        "btc", "bitcoin", "eth", "ether", "sol", "solana", "stablecoin",
        "depeg", "liquidat", "exchange insolven", "tether", "usdt", "usdc",
        "ftx", "binance", "coinbase", "hack", "exploit", "flash crash",
    )

    def choose_markets(self) -> List[dict]:
        if not self.market_client.use_polymarket:
            raise RuntimeError(
                "Cassandra requires POLYMARKET_BASE to list crypto-bear markets. "
                "Set POLYMARKET_BASE (and POLYMARKET_CHAIN_ID) in the env."
            )
        # Word-boundary match so "eth" doesn't fire on "Netherlands".
        pattern = re.compile(
            r"\b(" + "|".join(re.escape(k) for k in self.CRYPTO_KEYWORDS) + r")\b",
            re.IGNORECASE,
        )
        out: list[dict] = []
        for m in self.market_client.list_markets(limit=200):
            q = (m.get("question") or "")
            if not pattern.search(q):
                continue
            out.append({
                "marketIdHex": "0x" + keccak(m.get("question", "").encode()).hex(),
                "label": m.get("question", ""),
                "source": "polymarket",
                "external_id": m.get("conditionId"),
            })
            if len(out) >= 10:
                break
        if not out:
            raise RuntimeError(
                "No crypto markets found on Polymarket. Mandate keywords: "
                + ", ".join(self.CRYPTO_KEYWORDS)
            )
        return out

    def context_for_market(self, market: dict) -> str:
        try:
            r = requests.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": "bitcoin,ethereum,solana", "vs_currencies": "usd",
                        "include_24hr_change": "true"},
                timeout=5,
            )
            data = r.json()
            return "Spot snapshot:\n" + "\n".join(
                f"- {k}: ${v['usd']} ({v.get('usd_24h_change',0):.2f}% 24h)" for k, v in data.items()
            )
        except Exception:
            return ""

    def decide_position_amount(self, brain: BrainResult, market: dict) -> int:
        # Cassandra leans into NO when the brain says >0.55 — only fades into YES on conviction.
        conf = brain.confidence if brain.confidence is not None else 0.5
        return int((8 + 24 * conf) * 1_000_000)
