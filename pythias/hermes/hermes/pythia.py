"""Hermes — geopolitics Pythia.

Data sources: Reuters / AP / WSJ RSS, plus optional NewsAPI key.
"""
from __future__ import annotations
import logging
import re
import feedparser
from typing import List

from pythia_shared.base_pythia import BasePythia
from pythia_shared.polymarket_client import PredictionMarketClient
from eth_utils import keccak

log = logging.getLogger("hermes")

NEWS_FEEDS = [
    "http://feeds.reuters.com/Reuters/worldNews",
    "https://apnews.com/hub/world-news/rss",
]


class HermesPythia(BasePythia):
    def __init__(self, manifest_path: str):
        super().__init__(manifest_path)
        self.market_client = PredictionMarketClient()

    def system_prompt(self) -> str:
        return (
            "You are Hermes, the geopolitics Pythia. Forecast outcomes of\n"
            "elections, conflicts, sanctions packages, ceasefires, treaty signings.\n"
            "Distinguish base rates from headline noise. Quote any source you use.\n"
            "Anything outside geopolitics will slash 25% of your bond."
        )

    GEO_KEYWORDS = (
        "election", "president", "primary", "nominat", "senate", "house race",
        "ukraine", "russia", "putin", "zelensk", "israel", "gaza", "iran",
        "china", "taiwan", "trump", "biden", "harris", "sanction", "treaty",
        "war", "coup", "ceasefire", "north korea", "saudi", "nato",
    )

    def choose_markets(self) -> List[dict]:
        if not self.market_client.use_polymarket:
            raise RuntimeError(
                "Hermes requires POLYMARKET_BASE to list geopolitics markets. "
                "Set POLYMARKET_BASE (and POLYMARKET_CHAIN_ID) in the env."
            )
        pattern = re.compile(
            r"\b(" + "|".join(re.escape(k) for k in self.GEO_KEYWORDS) + r")\b",
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
                "No geopolitics markets found on Polymarket. Mandate keywords: "
                + ", ".join(self.GEO_KEYWORDS)
            )
        return out

    def context_for_market(self, market: dict) -> str:
        out: list[str] = []
        for url in NEWS_FEEDS:
            try:
                d = feedparser.parse(url)
                out.append(f"--- {url} ---\n" + "\n".join(
                    f"- {e.get('title','')}: {e.get('summary','')[:160]}" for e in d.entries[:5]
                ))
            except Exception:
                continue
        return "\n\n".join(out)
