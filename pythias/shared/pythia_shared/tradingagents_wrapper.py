"""Two-stage agent brain: research -> forecast.

The daemon used to single-shot OpenAI with a vague prompt. Real probabilistic
forecasters do not work that way; they (a) gather evidence then (b) commit a
probability. We mirror that structure here so the Irys-pinned trace reads as
an agent run, not a prompt.

Stage 1 — research: produce structured evidence JSON
    { signals: string[], historicalBaseline: str, keyUncertainties: string[],
      crowdView: str | null }

Stage 2 — forecast: combine stage-1 evidence + market label + optional self-
calibration hint into the final probability + confidence + one-line rationale.

If OPENAI_API_KEY is unset, the brain refuses to run. This is intentional:
a stub forecast that gets signed and emitted on-chain is indistinguishable
from a real one in the Irys trace, which is dishonest. Use `AGORA_DRY_RUN=1`
to opt into the stub explicitly (for CI / local plumbing tests).
"""
from __future__ import annotations
import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("pythia.brain")


@dataclass
class BrainResult:
    prob: float                 # 0..1
    trace: str                  # JSON of both stages
    rationale: str              # 1-sentence summary
    confidence: Optional[float] = None
    stages: Optional[dict] = None  # raw stage outputs for debugging


def run_brain(
    *,
    market_label: str,
    mandate_categories: list[str],
    context: str,
    system_prompt: str = "",
    model: str = "gpt-4o-mini",
    rolling_brier: Optional[float] = None,
    crowd_view: Optional[float] = None,
) -> BrainResult:
    """Run the two-stage agent brain on a single market.

    Args:
        market_label: human label, e.g. "US CPI YoY for May 2026 > 3.2%"
        mandate_categories: declared mandate; out-of-mandate calls slash bond
        context: free-text context (news clips, FRED snapshot, prior fills, etc.)
        system_prompt: optional per-Pythia overlay; default is mandate-aware
        model: OpenAI model id
        rolling_brier: recent rolling Brier across this Pythia's last N
            resolved forecasts; injected as self-calibration hint
        crowd_view: if a prediction-market book snapshot is available, the
            implied YES probability; injected as anchor for the forecast stage

    Returns:
        BrainResult with prob in [0,1], rationale, confidence, and a trace
        containing both stages as JSON.

    Raises:
        RuntimeError: if OPENAI_API_KEY is unset and AGORA_DRY_RUN != "1".
    """
    dry_run = os.environ.get("AGORA_DRY_RUN") == "1"
    api_key = os.environ.get("OPENAI_API_KEY")

    if dry_run and not api_key:
        return _dry_run_result(market_label, mandate_categories, crowd_view)

    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is required to run the Agora brain. "
            "Set AGORA_DRY_RUN=1 to bypass for local plumbing tests "
            "(traces will be marked [DRY-RUN])."
        )

    try:
        from openai import OpenAI  # type: ignore
    except ImportError as exc:
        raise RuntimeError("openai package not installed; pip install openai") from exc

    client = OpenAI(api_key=api_key)
    mandate_str = ", ".join(mandate_categories) if mandate_categories else "general"

    # ---- Stage 1: research ----------------------------------------------
    research_sys = (
        "You are the RESEARCH stage of a two-stage probabilistic forecaster. "
        "You DO NOT commit a probability. You produce structured evidence. "
        f"Your declared mandate: {mandate_str}. "
        "If the market is outside this mandate, set 'outOfMandate': true and "
        "explain why in 'historicalBaseline'."
    )
    research_user = f"""Market: {market_label}

Context provided:
{context[:7000]}

Return a JSON object with these keys:
- signals: array of 3-6 strings; each a discrete piece of evidence drawn from
  context. If context is thin, say so explicitly per signal.
- historicalBaseline: 1-2 sentences naming a comparable past event and its
  resolution rate (or "no comparable history found").
- keyUncertainties: array of 2-4 strings; what would flip your read.
- crowdView: string describing what the market is currently pricing if
  context mentions it, else "unavailable".
- outOfMandate: boolean; true only if the market falls outside the mandate."""
    r1 = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        temperature=0.2,
        messages=[
            {"role": "system", "content": research_sys},
            {"role": "user", "content": research_user},
        ],
    )
    stage1_text = r1.choices[0].message.content or "{}"
    try:
        stage1 = json.loads(stage1_text)
    except json.JSONDecodeError:
        stage1 = {"signals": [], "historicalBaseline": stage1_text[:200], "keyUncertainties": [], "crowdView": "parse error"}

    # ---- Stage 2: forecast ----------------------------------------------
    forecast_sys = (
        (system_prompt or "").strip()
        or "You are the FORECAST stage of a two-stage probabilistic forecaster. "
        "Given the evidence package, commit a single calibrated probability."
        + f" Declared mandate: {mandate_str}. "
        + "Out-of-mandate forecasts will slash 25% of your bond — refuse with prob=0.5 + rationale if so."
    )
    feedback_line = ""
    if rolling_brier is not None:
        feedback_line = (
            f"\nSelf-calibration hint: your last N resolved forecasts had rolling Brier "
            f"= {rolling_brier:.3f}. {'Lower' if rolling_brier > 0.25 else 'Keep'} confidence "
            f"unless evidence is strong."
        )
    crowd_line = ""
    if crowd_view is not None:
        crowd_line = f"\nMarket-implied YES probability (book snapshot): {crowd_view:.3f}"

    forecast_user = f"""Market: {market_label}

Evidence (from stage 1):
{json.dumps(stage1, indent=2)[:6000]}
{crowd_line}{feedback_line}

Commit:
- prob: float, your YES probability in [0,1]
- confidence: float [0,1] — how strongly you believe in this prob given evidence quality
- rationale: 1 sentence; cite at least one signal from the evidence by name
- diff_from_crowd: float; (your prob - crowdView) if crowdView is available, else null

Return JSON only."""
    r2 = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        temperature=0.1,
        messages=[
            {"role": "system", "content": forecast_sys},
            {"role": "user", "content": forecast_user},
        ],
    )
    stage2_text = r2.choices[0].message.content or "{}"
    try:
        stage2 = json.loads(stage2_text)
    except json.JSONDecodeError:
        stage2 = {"prob": 0.5, "confidence": 0.0, "rationale": "stage-2 parse error"}

    prob = max(0.0, min(1.0, float(stage2.get("prob", 0.5))))
    confidence = stage2.get("confidence")
    if confidence is not None:
        confidence = max(0.0, min(1.0, float(confidence)))
    rationale = stage2.get("rationale", "")

    trace_obj = {
        "version": "agora-brain/2.0",
        "model": model,
        "market": market_label,
        "mandate": mandate_categories,
        "stage1_research": stage1,
        "stage2_forecast": stage2,
        "self_calibration": {"rollingBrier": rolling_brier},
        "crowd_view_input": crowd_view,
    }

    return BrainResult(
        prob=prob,
        trace=json.dumps(trace_obj, sort_keys=True, indent=None),
        rationale=rationale,
        confidence=confidence,
        stages=trace_obj,
    )


def _dry_run_result(market_label: str, mandate_categories: list[str], crowd_view: Optional[float]) -> BrainResult:
    """Explicit stub for AGORA_DRY_RUN=1. Trace is clearly labeled [DRY-RUN]."""
    prob = crowd_view if crowd_view is not None else 0.5
    trace = json.dumps({
        "version": "agora-brain/2.0",
        "DRY_RUN": True,
        "market": market_label,
        "mandate": mandate_categories,
        "prob": prob,
        "crowd_view": crowd_view,
        "note": "OPENAI_API_KEY unset; emitting stub to verify plumbing.",
    }, sort_keys=True)
    return BrainResult(prob=prob, trace=trace, rationale="[DRY-RUN] no brain", confidence=0.0)
