"""Irys pinning. Uses the Irys public devnet for the hackathon.

Returns (irys_id, keccak256(payload)) so the on-chain `traceHash` matches what
the indexer recomputes when fetching the trace back.
"""
from __future__ import annotations
import os
import time
from typing import Tuple
import requests
from eth_utils import keccak


def pin_trace(payload: str, tags: list[tuple[str, str]] | None = None) -> Tuple[str, bytes]:
    """Pin `payload` to Irys. Returns (txn id, keccak256 hash of payload).

    The default node is devnet.irys.xyz; override via IRYS_NODE.
    If IRYS_PRIVATE_KEY is unset, fall back to dry-run mode that returns a
    placeholder id so local development works without a funded Irys wallet.
    """
    node = os.environ.get("IRYS_NODE", "https://devnet.irys.xyz")
    pk = os.environ.get("IRYS_PRIVATE_KEY")
    body = payload.encode("utf-8")
    digest = keccak(body)

    if not pk:
        placeholder = "dryrun-" + digest.hex()[:24]
        return placeholder, digest

    # The Irys REST upload requires signing the data with the wallet key. The
    # simplest production path is the `@irys/sdk` (JS) or `irys` (Python) lib;
    # for the hackathon we POST to a small wrapper. If the wrapper isn't
    # configured, fall back to dry-run so the daemon doesn't crash.
    try:
        r = requests.post(
            f"{node}/api/upload",
            data=body,
            headers={"x-private-key": pk, "content-type": "text/plain"},
            timeout=8,
        )
        r.raise_for_status()
        return r.json()["id"], digest
    except Exception:
        return "dryrun-" + digest.hex()[:24], digest
