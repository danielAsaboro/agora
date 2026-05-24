import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Prisma singleton.
 * In dev, Next.js hot-reloads modules; without this guard we'd open a fresh
 * connection pool every change and exhaust Postgres connections.
 */
export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "1" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

/** Utility: 0x-prefixed hex → Buffer for bytea columns. */
export function hexToBuf(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean, "hex");
}

/** Utility: bytea Buffer → 0x-prefixed hex. */
export function bufToHex(b: Buffer | Uint8Array | null | undefined): string | null {
  if (!b) return null;
  return "0x" + Buffer.from(b).toString("hex");
}
