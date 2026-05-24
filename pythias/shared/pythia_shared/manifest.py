"""Manifest schema + canonical hashing. Must match lib/manifest.ts."""
from __future__ import annotations
import json
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import List, Optional
from eth_utils import keccak
from eth_abi import encode as abi_encode


@dataclass
class TargetMarket:
    source: str            # "polymarket" | "limitless" | "manifold" | "oddsapi" | "hephaestus_arc"
    label: str
    marketIdHex: str


@dataclass
class Manifest:
    name: str
    owner: str
    daemon: str
    description: str
    modelFingerprint: str
    mandateCategories: List[str]
    targetMarkets: List[TargetMarket]
    accuracyMetric: str = "brier"
    slashingFloorBps: int = 0
    bondFloor: str = "0"
    framework: str = "tradingagents@0.2.4"
    profileImageUrl: Optional[str] = None
    links: Optional[dict] = None
    createdAt: str = ""

    def to_canonical_json(self) -> bytes:
        d = asdict(self)
        # JSON.stringify with sorted keys is the canonical form
        return json.dumps(d, sort_keys=True, separators=(",", ":")).encode("utf-8")


def manifest_hash(m: Manifest) -> bytes:
    return keccak(m.to_canonical_json())


def mandate_root(categories: List[str]) -> bytes:
    sorted_norm = sorted((c.strip().lower() for c in categories))
    packed = abi_encode(["string[]"], [sorted_norm])
    return keccak(packed)


def name_hash(name: str) -> bytes:
    return keccak(name.encode("utf-8"))


def load_manifest(path: str | Path) -> Manifest:
    raw = json.loads(Path(path).read_text())
    raw["targetMarkets"] = [TargetMarket(**tm) for tm in raw.get("targetMarkets", [])]
    return Manifest(**raw)


def save_manifest(m: Manifest, path: str | Path):
    Path(path).write_text(json.dumps(asdict(m), indent=2, sort_keys=True))
