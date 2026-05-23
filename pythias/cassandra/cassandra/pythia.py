"""Cassandra — bear-bias crypto Pythia.

Data: Coingecko prices, DeFiLlama TVL / borrows, Coinglass liquidations.
Default: free public endpoints; configure keys for production.
"""
from __future__ import annotations
import requests
from typing import List
from pythia_shared.base_pythia import BasePythia
from pythia_shared.tradingagents_wrapper import BrainResult
from eth_utils import keccak


class CassandraPythia(BasePythia):
    def system_prompt(self) -> str:
        return (
            "You are Cassandra. Your edge is bear-side discipline: you forecast\n"
            "drawdowns, liquidations, depegs, exchange insolvencies. You are NOT\n"
            "perma-bearish — you're calibrated, but you watch the things that\n"
            "break. Stay within crypto-downside or 25% of your bond burns."
        )

    def choose_markets(self) -> List[dict]:
        labels = [
            "BTC < $80,000 by end of next week",
            "ETH < $2,500 by end of next week",
            "Any top-10 stablecoin depegs >1% in next 7 days",
            "$500M+ of liquidations in any 24h window next 7 days",
        ]
        return [{"marketIdHex": "0x" + keccak(l.encode()).hex(), "label": l, "source": "mock"} for l in labels]

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
