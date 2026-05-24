"""Hephaestus — engineering shipping Pythia.

Reads GitHub activity (commits, PR merges, release tags) for tracked repos
and predicts whether feature X ships by date Y. Markets are custom: Hephaestus
owns its market space and posts the question set on chain to the prediction
market adapter at NEXT_PUBLIC_MOCK_MARKET_ADDRESS at boot.
"""
from __future__ import annotations
import os
import requests
from typing import List
from pythia_shared.base_pythia import BasePythia
from eth_utils import keccak


TRACKED_REPOS = [
    ("the-canteen-dev", "ARC-cli"),
    ("circlefin", "stablecoin-evm"),
    ("ethereum", "go-ethereum"),
    ("anza-xyz", "agave"),
]


class HephaestusPythia(BasePythia):
    def __init__(self, manifest_path):
        super().__init__(manifest_path)
        self.gh_token = os.environ.get("HEPHAESTUS_GITHUB_TOKEN", "")

    def system_prompt(self) -> str:
        return (
            "You are Hephaestus, the engineering Pythia. Estimate the probability\n"
            "that the target feature ships by the stated deadline.\n"
            "Use observable signals only: recent commit cadence, PR merge ratio,\n"
            "labeled milestones, and release tag intervals.\n"
            "Out-of-engineering forecasts slash 25% of your bond."
        )

    def choose_markets(self) -> List[dict]:
        # Custom market space owned by Hephaestus. The labels below are the
        # canonical question set; the daemon's bootstrap path posts them on
        # chain to the Arc prediction-market adapter so they have on-chain
        # market IDs. These are not mocks — they are markets Hephaestus
        # created.
        labels = [
            "ARC-cli ships gateway support before EOY",
            "Geth ships verkle tree migration in next 90 days",
            "Agave releases v2.x mainnet in next 60 days",
            "Circle stablecoin-evm cuts a v3 release in next 30 days",
        ]
        return [
            {
                "marketIdHex": "0x" + keccak(l.encode()).hex(),
                "label": l,
                "source": "hephaestus_arc",
            }
            for l in labels
        ]

    def context_for_market(self, market: dict) -> str:
        out: list[str] = []
        headers = {"Accept": "application/vnd.github+json"}
        if self.gh_token:
            headers["Authorization"] = f"Bearer {self.gh_token}"
        for owner, repo in TRACKED_REPOS:
            try:
                r = requests.get(
                    f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=5",
                    headers=headers, timeout=4,
                )
                if r.status_code == 200:
                    cs = r.json()
                    out.append(f"{owner}/{repo} recent commits: " + ", ".join(
                        f"{c['commit']['author']['date'][:10]} {c['commit']['message'][:60]}" for c in cs[:3]
                    ))
            except Exception:
                continue
        return "\n".join(out)
