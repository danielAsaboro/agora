"""Athena — sports Pythia.

Data: OddsAPI (the-odds-api.com) for moneylines + spreads; ESPN scoreboard JSON
for live game state. Free tier of OddsAPI = enough headroom for the demo.
"""
from __future__ import annotations
import os
import requests
from typing import List
from pythia_shared.base_pythia import BasePythia
from eth_utils import keccak

ODDS_BASE = "https://api.the-odds-api.com/v4"


class AthenaPythia(BasePythia):
    def system_prompt(self) -> str:
        return (
            "You are Athena, the tactical sports Pythia. Compute calibrated\n"
            "win probabilities from market odds, recent form, injuries, and\n"
            "home/away splits. You target soft books — public bettor bias.\n"
            "Out-of-sport forecasts slash 25% of bond."
        )

    def choose_markets(self) -> List[dict]:
        key = os.environ.get("ATHENA_ODDSAPI_KEY")
        if not key:
            # Demo fallback
            return [
                {"marketIdHex": "0x" + keccak(b"Lakers vs Celtics Game 5 - Lakers win").hex(),
                 "label": "Lakers vs Celtics Game 5 - Lakers win", "source": "mock"},
            ]
        try:
            r = requests.get(
                f"{ODDS_BASE}/sports/basketball_nba/odds",
                params={"apiKey": key, "regions": "us", "markets": "h2h", "oddsFormat": "decimal"},
                timeout=6,
            )
            r.raise_for_status()
            out = []
            for ev in r.json()[:6]:
                label = f"{ev['home_team']} beats {ev['away_team']}"
                out.append({
                    "marketIdHex": "0x" + keccak(label.encode()).hex(),
                    "label": label,
                    "source": "mock",
                    "odds": ev.get("bookmakers", [{}])[0],
                })
            return out
        except Exception:
            return []

    def context_for_market(self, market: dict) -> str:
        odds = market.get("odds")
        if not odds:
            return ""
        return f"Book odds snapshot:\n{odds}"
