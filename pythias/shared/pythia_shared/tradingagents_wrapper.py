"""Thin adapter over TauricResearch/TradingAgents.

The brain produces a `prob: float in [0,1]` and a `trace: str`. We don't pin
TradingAgents at this layer — each Pythia owns its concrete brain and may
swap in alpacatradingagent, TradingAgents-CN, or a custom LangGraph chain.

The adapter falls back to a single-shot OpenAI call when TradingAgents isn't
installed, so the demo path still works.
"""
from __future__ import annotations
import json
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class BrainResult:
    prob: float                 # 0..1
    trace: str                  # JSON / markdown reasoning
    rationale: str              # 1-sentence summary
    confidence: Optional[float] = None


def run_brain(
    *,
    market_label: str,
    mandate_categories: list[str],
    context: str,
    system_prompt: str = "",
    model: str = "gpt-4o-mini",
) -> BrainResult:
    """Run the agent brain on a single market. Returns a BrainResult.

    Falls back to a single-shot structured-JSON OpenAI call if TradingAgents
    isn't installed or refuses to load. This keeps the demo end-to-end
    functional even on a fresh clone.

    If `OPENAI_API_KEY` is unset, returns a deterministic stub (prob=0.5) so
    integration tests can run without API access.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        return BrainResult(
            prob=0.5,
            trace=f"[DRY-RUN] No OPENAI_API_KEY; returning stub for '{market_label}'. "
                  f"Mandate: {mandate_categories}.",
            rationale="dry-run stub",
            confidence=0.0,
        )
    try:
        from openai import OpenAI  # type: ignore
    except ImportError as exc:
        raise RuntimeError("openai not installed; pip install openai") from exc

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    sys = (system_prompt or "").strip() or _DEFAULT_SYSTEM.format(
        mandate=", ".join(mandate_categories)
    )
    user = f"""Market: {market_label}

Context:
{context[:8000]}

Produce a JSON object with:
- prob: float, your YES probability for this market in [0,1]
- rationale: one sentence
- trace: 200-600 word reasoning trace; show your work
- confidence: float [0,1]"""
    resp = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        temperature=0.2,
        messages=[
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
    )
    txt = resp.choices[0].message.content or "{}"
    data = json.loads(txt)
    prob = max(0.0, min(1.0, float(data.get("prob", 0.5))))
    return BrainResult(
        prob=prob,
        trace=data.get("trace", ""),
        rationale=data.get("rationale", ""),
        confidence=data.get("confidence"),
    )


_DEFAULT_SYSTEM = """You are a bonded probabilistic forecaster on the Agora.
Your declared mandate categories: {mandate}.
You must:
- Return calibrated probabilities — overconfidence is penalized by Brier score.
- Show your reasoning step-by-step so judges can audit your trace.
- Avoid hedging language ("could", "might"); commit to a number.
- Stay strictly within mandate. Out-of-mandate forecasts will slash 25% of bond."""
