"""Apollo — macro Pythia.

Data sources:
  - FRED (CPI, NFP, GDP, Fed funds)  via fredapi
  - BLS news releases                 (no API key required)
  - FOMC headlines                    (RSS via feedparser)

The brain decides probabilities on a small set of headline-driven macro markets.
"""
from __future__ import annotations
import os
import logging
from datetime import datetime, timedelta
from typing import List

import feedparser
from pythia_shared.base_pythia import BasePythia
from pythia_shared.tradingagents_wrapper import BrainResult
from pythia_shared.polymarket_client import PredictionMarketClient
from eth_utils import keccak

log = logging.getLogger("apollo")

FOMC_RSS = "https://www.federalreserve.gov/feeds/press_monetary.xml"
BLS_RSS = "https://www.bls.gov/feed/bls_latest.rss"


class ApolloPythia(BasePythia):
    def __init__(self, manifest_path: str):
        super().__init__(manifest_path)
        self.market_client = PredictionMarketClient()
        self.fred_key = os.environ.get("APOLLO_FRED_API_KEY", "")

    def system_prompt(self) -> str:
        return (
            "You are Apollo, the macro Pythia. Forecast US macro outcomes:\n"
            "  - CPI, core CPI, PPI prints\n"
            "  - FOMC decisions and dot plots\n"
            "  - NFP, unemployment, JOLTS\n"
            "  - GDP, retail sales\n"
            "Use the provided context. Calibrate to historical base rates.\n"
            "Never venture outside macro: that would slash 25% of your bond."
        )

    def choose_markets(self) -> List[dict]:
        # 1. Try live Polymarket macro markets
        out: list[dict] = []
        if self.market_client.use_polymarket:
            for m in self.market_client.list_markets(category="macro", limit=10):
                out.append({
                    "marketIdHex": "0x" + keccak(m.get("question", "").encode()).hex(),
                    "label": m.get("question", ""),
                    "source": "polymarket",
                    "external_id": m.get("conditionId"),
                })
        # 2. Fallback: a hard-coded representative set for the demo
        if not out:
            for label in [
                "US Headline CPI YoY > 3.0% in next print",
                "FOMC raises rates at next meeting",
                "Unemployment rate >= 4.5% in next NFP",
                "US Q-on-Q GDP growth annualized > 2.0%",
            ]:
                out.append({
                    "marketIdHex": "0x" + keccak(label.encode()).hex(),
                    "label": label,
                    "source": "mock",
                })
        return out

    def context_for_market(self, market: dict) -> str:
        chunks: list[str] = []
        fomc = _rss_top(FOMC_RSS, "FOMC")
        if fomc:
            chunks.append("=== Recent FOMC press releases ===\n" + fomc)
        bls = _rss_top(BLS_RSS, "BLS")
        if bls:
            chunks.append("=== Recent BLS releases ===\n" + bls)
        if self.fred_key:
            chunks.append("=== FRED snapshot ===\n" + _fred_snapshot(self.fred_key))
        return "\n\n".join(chunks)

    def decide_position_amount(self, brain: BrainResult, market: dict) -> int:
        # Apollo sizes more aggressively when confidence is high.
        conf = brain.confidence if brain.confidence is not None else 0.5
        edge = abs(brain.prob - 0.5)  # distance from indifference
        usd = 5 + 25 * conf + 30 * edge
        return int(usd * 1_000_000)


def _rss_top(url: str, label: str, n: int = 5) -> str:
    try:
        d = feedparser.parse(url)
        items = d.entries[:n]
        return "\n".join(f"- {e.get('title','')}: {e.get('summary','')[:200]}" for e in items)
    except Exception as e:
        log.warning("%s rss failed: %s", label, e)
        return ""


def _fred_snapshot(api_key: str) -> str:
    try:
        from fredapi import Fred  # type: ignore
        f = Fred(api_key=api_key)
        bits = []
        for series in ["CPIAUCSL", "UNRATE", "FEDFUNDS", "GDPC1"]:
            try:
                s = f.get_series(series).dropna().tail(3)
                bits.append(f"{series}: " + ", ".join(f"{i.date()}={v:.3f}" for i, v in s.items()))
            except Exception:
                continue
        return "\n".join(bits)
    except Exception as e:
        log.warning("fred snapshot failed: %s", e)
        return ""
