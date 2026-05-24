"""Sanity tests for the two-stage agent brain.

The fail-fast contract is the important one: a missing OPENAI_API_KEY must
NOT silently produce a stub forecast, because that stub would be signed and
emitted on-chain identically to a real one. The Irys-pinned trace would be
indistinguishable from a real agent run — that's dishonest.

To bypass for local plumbing, set AGORA_DRY_RUN=1 explicitly. The trace is
then marked [DRY-RUN] in `BrainResult.trace`.
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

import pytest

# Allow `from pythia_shared.tradingagents_wrapper import run_brain` without an
# editable install. We import the module directly to avoid pulling the rest
# of the package (which depends on web3/eth-utils).
SHARED = Path(__file__).resolve().parents[1] / "pythia_shared"
sys.path.insert(0, str(SHARED.parent))

# Import the module file directly so test environments without eth_utils
# installed don't trip on the package __init__. Register in sys.modules first
# so @dataclass can resolve the class's __module__ during decoration.
import importlib.util as _il
_brain_spec = _il.spec_from_file_location(
    "tradingagents_wrapper", str(SHARED / "tradingagents_wrapper.py")
)
brain = _il.module_from_spec(_brain_spec)
sys.modules["tradingagents_wrapper"] = brain
_brain_spec.loader.exec_module(brain)


def test_brain_fails_fast_without_key(monkeypatch):
    """OPENAI_API_KEY missing + AGORA_DRY_RUN not set => RuntimeError.

    We want a loud failure rather than a quiet stub so a misconfigured
    deployment can never sign + emit fake forecasts.
    """
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AGORA_DRY_RUN", raising=False)
    with pytest.raises(RuntimeError) as exc_info:
        brain.run_brain(
            market_label="Will X happen by Y?",
            mandate_categories=["macro"],
            context="some 100+ char context here so the gate doesn't intercept us first" * 3,
        )
    assert "OPENAI_API_KEY" in str(exc_info.value)


def test_brain_dry_run_when_explicitly_opted_in(monkeypatch):
    """AGORA_DRY_RUN=1 with no key returns the labeled stub."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("AGORA_DRY_RUN", "1")
    result = brain.run_brain(
        market_label="dry-run market",
        mandate_categories=["macro"],
        context="not used in dry run",
    )
    assert result.prob == 0.5  # no crowd view → coin flip
    assert "DRY_RUN" in result.trace
    assert result.confidence == 0.0


def test_brain_dry_run_anchors_to_crowd_view(monkeypatch):
    """When the daemon has a Polymarket midpoint, dry-run anchors to it
    rather than 0.5, so plumbing tests reflect realistic flow."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("AGORA_DRY_RUN", "1")
    result = brain.run_brain(
        market_label="dry-run with crowd view",
        mandate_categories=["macro"],
        context="ctx",
        crowd_view=0.72,
    )
    assert result.prob == 0.72
    parsed = json.loads(result.trace)
    assert parsed["crowd_view"] == 0.72
