import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/disputes/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  prisma: {
    dispute: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    forecast: {
      findUnique: vi.fn(),
    },
  },
  hexToBuf: (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex"),
  bufToHex: (b: Buffer | Uint8Array | null | undefined) => {
    if (!b) return null;
    return "0x" + Buffer.from(b).toString("hex");
  },
}));

vi.mock("@/lib/openai-validator", () => ({
  validateTraceFraud: vi.fn(),
}));

vi.mock("@/lib/traction", () => ({
  pushTraction: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/disputes");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/disputes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_NAME_HASH = "0x" + "a".repeat(64);
const VALID_TRACE_HASH = "0x" + "b".repeat(64);
const VALID_ADDRESS = "0x" + "c".repeat(40);
const VALID_RATIONALE =
  "This is a valid rationale that is long enough to pass validation.";

// ---------------------------------------------------------------------------
// Shared mock instances (imported after vi.mock so they're the mocked versions)
// ---------------------------------------------------------------------------

async function getMocks() {
  const { prisma } = await import("@/lib/db");
  const { validateTraceFraud } = await import("@/lib/openai-validator");
  const { pushTraction } = await import("@/lib/traction");
  return { prisma, validateTraceFraud, pushTraction };
}

// ---------------------------------------------------------------------------
// GET /api/disputes
// ---------------------------------------------------------------------------

describe("GET /api/disputes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path — returns disputes list", async () => {
    const { prisma } = await getMocks();
    const traceHashBuf = Buffer.from("b".repeat(64), "hex");
    const mockDisputes = [
      {
        id: 1,
        traceHash: traceHashBuf,
        submitterAddress: VALID_ADDRESS,
        rationale: VALID_RATIONALE,
        status: "upheld",
        createdAt: new Date("2024-01-01"),
        resolvedAt: new Date("2024-01-02"),
        validatorVerdict: { ok: false, reason: "fraud" },
      },
      {
        id: 2,
        traceHash: traceHashBuf,
        submitterAddress: VALID_ADDRESS,
        rationale: VALID_RATIONALE,
        status: "rejected",
        createdAt: new Date("2024-01-03"),
        resolvedAt: new Date("2024-01-04"),
        validatorVerdict: { ok: true, reason: "consistent" },
      },
    ];
    vi.mocked(prisma.dispute.findMany).mockResolvedValue(mockDisputes as any);

    const req = makeGetRequest({ nameHash: VALID_NAME_HASH });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("disputes");
    expect(json.disputes).toHaveLength(2);
    // traceHash should be converted to hex string
    expect(typeof json.disputes[0].traceHash).toBe("string");
    expect(json.disputes[0].traceHash).toMatch(/^0x[0-9a-f]+$/i);
  });

  it("missing nameHash → 400", async () => {
    const req = makeGetRequest({});
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toHaveProperty("error");
  });

  it("invalid nameHash format → 400", async () => {
    // Too short
    const req1 = makeGetRequest({ nameHash: "0x1234" });
    const res1 = await GET(req1);
    expect(res1.status).toBe(400);

    // No 0x prefix
    const req2 = makeGetRequest({ nameHash: "a".repeat(64) });
    const res2 = await GET(req2);
    expect(res2.status).toBe(400);

    // Non-hex characters
    const req3 = makeGetRequest({ nameHash: "0x" + "z".repeat(64) });
    const res3 = await GET(req3);
    expect(res3.status).toBe(400);
  });

  it("limit capped at 50", async () => {
    const { prisma } = await getMocks();
    vi.mocked(prisma.dispute.findMany).mockResolvedValue([]);

    const req = makeGetRequest({ nameHash: VALID_NAME_HASH, limit: "100" });
    await GET(req);

    expect(prisma.dispute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it("default limit 20", async () => {
    const { prisma } = await getMocks();
    vi.mocked(prisma.dispute.findMany).mockResolvedValue([]);

    const req = makeGetRequest({ nameHash: VALID_NAME_HASH });
    await GET(req);

    expect(prisma.dispute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/disputes
// ---------------------------------------------------------------------------

describe("POST /api/disputes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    nameHashHex: VALID_NAME_HASH,
    traceHashHex: VALID_TRACE_HASH,
    submitterAddress: VALID_ADDRESS,
    rationale: VALID_RATIONALE,
  };

  const mockForecast = {
    id: 1,
    traceHash: Buffer.from("b".repeat(64), "hex"),
    marketId: Buffer.from("d".repeat(64), "hex"),
    probScaled: BigInt("500000000000000000"), // 0.5 in 1e18
    traceIrysId: null,
  };

  it("happy path — fraud detected (verdict.ok = false)", async () => {
    const { prisma, validateTraceFraud } = await getMocks();
    vi.mocked(prisma.forecast.findUnique).mockResolvedValue(mockForecast as any);
    vi.mocked(validateTraceFraud).mockResolvedValue({
      ok: false,
      reason: "trace inconsistent",
      confidence: 0.9,
    });
    const createdDispute = {
      id: 10,
      nameHash: Buffer.from("a".repeat(64), "hex"),
      traceHash: Buffer.from("b".repeat(64), "hex"),
      submitterAddress: VALID_ADDRESS,
      rationale: VALID_RATIONALE,
      status: "upheld",
      createdAt: new Date(),
      resolvedAt: new Date(),
      validatorVerdict: { ok: false, reason: "trace inconsistent", confidence: 0.9 },
    };
    vi.mocked(prisma.dispute.create).mockResolvedValue(createdDispute as any);

    const req = makePostRequest(validBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.verdict.ok).toBe(false);
    expect(json.verdict.reason).toBe("trace inconsistent");
    expect(json.dispute).toBeDefined();

    // Verify dispute was created with status "upheld" (fraud confirmed)
    expect(prisma.dispute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "upheld" }),
      })
    );
  });

  it("happy path — no fraud (verdict.ok = true)", async () => {
    const { prisma, validateTraceFraud } = await getMocks();
    vi.mocked(prisma.forecast.findUnique).mockResolvedValue(mockForecast as any);
    vi.mocked(validateTraceFraud).mockResolvedValue({
      ok: true,
      reason: "consistent",
    });
    const createdDispute = {
      id: 11,
      status: "rejected",
    };
    vi.mocked(prisma.dispute.create).mockResolvedValue(createdDispute as any);

    const req = makePostRequest(validBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.verdict.ok).toBe(true);

    // Verify dispute was created with status "rejected" (no fraud)
    expect(prisma.dispute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected" }),
      })
    );
  });

  it("schema validation — missing nameHashHex → 400", async () => {
    const { nameHashHex: _omit, ...bodyWithoutNameHash } = validBody;
    const req = makePostRequest(bodyWithoutNameHash);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toHaveProperty("error");
  });

  it("schema validation — rationale too short → 400", async () => {
    const req = makePostRequest({ ...validBody, rationale: "too short" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toHaveProperty("error");
  });

  it("schema validation — rationale too long → 400", async () => {
    const req = makePostRequest({ ...validBody, rationale: "x".repeat(2001) });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toHaveProperty("error");
  });

  it("schema validation — invalid address format → 400", async () => {
    const req = makePostRequest({ ...validBody, submitterAddress: "not-an-address" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toHaveProperty("error");
  });

  it("forecast not found → 404", async () => {
    const { prisma } = await getMocks();
    vi.mocked(prisma.forecast.findUnique).mockResolvedValue(null);

    const req = makePostRequest(validBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toHaveProperty("error");
  });

  it("irys fetch failure is silent — POST still succeeds", async () => {
    const { prisma, validateTraceFraud } = await getMocks();
    const forecastWithIrys = { ...mockForecast, traceIrysId: "some-irys-id" };
    vi.mocked(prisma.forecast.findUnique).mockResolvedValue(forecastWithIrys as any);

    // Simulate fetch throwing (Irys unreachable)
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error")) as any;

    vi.mocked(validateTraceFraud).mockResolvedValue({
      ok: true,
      reason: "consistent despite empty trace",
    });
    vi.mocked(prisma.dispute.create).mockResolvedValue({ id: 12, status: "rejected" } as any);

    const req = makePostRequest(validBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    // Restore fetch
    globalThis.fetch = globalFetch;
  });
});
