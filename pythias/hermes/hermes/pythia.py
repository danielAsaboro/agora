"""Hermes — geopolitics Pythia.

Data sources: Reuters / AP / WSJ RSS, plus optional NewsAPI key.
"""
from __future__ import annotations
import logging
import feedparser
from typing import List

from pythia_shared.base_pythia import BasePythia
from eth_utils import keccak

log = logging.getLogger("hermes")

NEWS_FEEDS = [
    "http://feeds.reuters.com/Reuters/worldNews",
    "https://apnews.com/hub/world-news/rss",
]


class HermesPythia(BasePythia):
    def system_prompt(self) -> str:
        return (
            "You are Hermes, the geopolitics Pythia. Forecast outcomes of\n"
            "elections, conflicts, sanctions packages, ceasefires, treaty signings.\n"
            "Distinguish base rates from headline noise. Quote any source you use.\n"
            "Anything outside geopolitics will slash 25% of your bond."
        )

    def choose_markets(self) -> List[dict]:
        seeds = [
            "Russia-Ukraine ceasefire signed by end of next quarter",
            "New US sanctions package on Iran in next 60 days",
            "EU sanctions vote passes 75% of member states",
            "Taiwan strait incident escalates to >100 troop movements next month",
        ]
        return [{"marketIdHex": "0x" + keccak(s.encode()).hex(), "label": s, "source": "mock"} for s in seeds]

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
