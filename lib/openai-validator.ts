/// OpenAI-validator for trace-fraud disputes.
/// Pattern lifted from arc-escrow: given a pinned trace and the claimed forecast,
/// ask the model whether the trace could have legitimately produced that forecast.
/// Returns {ok: true} (no fraud) or {ok: false, reason} (fraud).
import OpenAI from "openai";
import { env } from "./env";

export interface ValidatorVerdict {
  ok: boolean;
  reason: string;
  reproducedProb?: number;
  confidence?: number;
}

const SYSTEM = `You audit a published "forecast" against the reasoning trace the
agent claims to have produced for it. Decide whether the trace plausibly leads
to the reported probability. Return strict JSON:
{
  "ok": boolean,        // true = trace is consistent with the forecast
  "reason": string,     // 1-2 sentences
  "reproducedProb": number,  // 0..1 — your independent prob from the same trace
  "confidence": number  // 0..1 — how confident you are
}`;

export async function validateTraceFraud(opts: {
  marketLabel: string;
  reportedProb: number;
  trace: string;
}): Promise<ValidatorVerdict> {
  const client = new OpenAI({ apiKey: env.openaiKey() });
  const userPrompt = `Market: ${opts.marketLabel}
Reported probability: ${opts.reportedProb.toFixed(4)}
---
Trace:
${opts.trace.slice(0, 12000)}`;
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt },
    ],
  });
  const txt = res.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(txt) as ValidatorVerdict;
    return {
      ok: !!parsed.ok,
      reason: parsed.reason ?? "",
      reproducedProb: parsed.reproducedProb,
      confidence: parsed.confidence,
    };
  } catch {
    return { ok: false, reason: "validator returned non-JSON" };
  }
}
