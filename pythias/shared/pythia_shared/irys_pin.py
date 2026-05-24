"""Irys pinning via the official @irys/sdk (driven from a Node subprocess).

We shell out to scripts/irys-upload.mjs to do the actual signing+upload
because the production Irys SDK is JavaScript-only. The subprocess reads the
payload on stdin, signs with IRYS_PRIVATE_KEY, uploads to Irys devnet, and
prints the resulting Irys transaction id on stdout.

The trace is then publicly retrievable at:

    https://devnet.irys.xyz/<irys_id>

Returns (irys_id, keccak256(payload)) so the on-chain `traceHash` matches the
keccak of the bytes that the indexer fetches back from the gateway.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Tuple

from eth_utils import keccak


class IrysUnconfigured(RuntimeError):
    pass


class IrysUploadFailed(RuntimeError):
    pass


def _find_repo_root() -> Path:
    """Locate the agora/ directory that contains scripts/irys-upload.mjs."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "scripts" / "irys-upload.mjs").exists():
            return parent
    raise RuntimeError(
        "Could not locate scripts/irys-upload.mjs from "
        f"{here}. Is the daemon being run from outside the agora repo?"
    )


def pin_trace(payload: str, tags: list[tuple[str, str]] | None = None) -> Tuple[str, bytes]:
    """Pin `payload` to Irys via the JS SDK subprocess.

    Raises IrysUnconfigured if IRYS_PRIVATE_KEY is unset and IrysUploadFailed
    if the upload itself fails. The daemon must not emit a forecast whose
    traceHash is on chain but whose trace is not actually pinned.
    """
    pk = os.environ.get("IRYS_PRIVATE_KEY")
    if not pk:
        raise IrysUnconfigured(
            "IRYS_PRIVATE_KEY is unset. Run `npm run irys:wallet` from "
            "the agora directory to generate one."
        )

    body = payload.encode("utf-8")
    digest = keccak(body)

    repo_root = _find_repo_root()
    env = os.environ.copy()
    # Forward Irys-related env explicitly so a partial env (e.g. python
    # subprocess started without dotenv loaded) still works.
    extra_tags = ",".join(f"{k}={v}" for k, v in (tags or []))
    if extra_tags:
        env["IRYS_EXTRA_TAGS"] = extra_tags

    try:
        proc = subprocess.run(
            ["node", "scripts/irys-upload.mjs"],
            input=body,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(repo_root),
            env=env,
            timeout=60,
            check=False,
        )
    except FileNotFoundError as e:
        raise IrysUploadFailed(
            "node executable not found on PATH. Install Node.js (>=18) so "
            "the daemon can shell out to scripts/irys-upload.mjs."
        ) from e
    except subprocess.TimeoutExpired as e:
        raise IrysUploadFailed("Irys upload timed out after 60s.") from e

    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise IrysUploadFailed(
            f"Irys upload failed (exit {proc.returncode}): {stderr}"
        )

    irys_id = proc.stdout.decode("utf-8", errors="replace").strip()
    if not irys_id:
        raise IrysUploadFailed("Irys upload returned an empty id.")
    return irys_id, digest
