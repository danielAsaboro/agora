/// Wrapper around `arc-canteen update traction`. Indexer + API routes call this
/// after user-facing actions so judges see live traction events on the CLI feed.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "./env";
import { prisma, hexToBuf } from "./db";

const exec = promisify(execFile);

export type TractionKind =
  | "pythia_registered"
  | "stake"
  | "forecast"
  | "resolved"
  | "dispute"
  | "invite";

export interface TractionEvent {
  kind: TractionKind;
  nameHashHex?: string;
  actor?: string;
  payload?: Record<string, unknown>;
}

export async function pushTraction(ev: TractionEvent): Promise<void> {
  // Always record to Postgres for our own activity feed.
  await prisma.tractionEvent.create({
    data: {
      kind: ev.kind,
      nameHash: ev.nameHashHex ? hexToBuf(ev.nameHashHex) : null,
      actor: ev.actor ?? null,
      payload: (ev.payload ?? {}) as any,
      pushedAt: new Date(),
    },
  });

  // Best-effort: fire `arc-canteen update traction <json>` so it shows on the
  // hackathon CLI feed. Swallow failures so they don't break the request path.
  try {
    const bin = env.arcCanteenBin();
    const body = JSON.stringify({ ...ev });
    await exec(bin, ["update", "traction", body], { timeout: 4000 });
  } catch (err) {
    console.warn("[traction] arc-canteen push failed:", (err as Error).message);
  }
}
