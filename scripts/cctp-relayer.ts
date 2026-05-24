/**
 * CCTP Relayer — watches source chain MessageTransmitter contracts for
 * MessageSent events destined for Arc Testnet, then polls Circle's attestation
 * API and calls MessageTransmitter.receiveMessage() on Arc to finalize them.
 *
 * Run: tsx scripts/cctp-relayer.ts
 *
 * Required env:
 *   CCTP_MESSAGE_TRANSMITTER_ARC  — Arc Testnet MessageTransmitter address
 *   CCTP_ARC_DOMAIN               — Circle domain ID for Arc Testnet (e.g. "9")
 *   RELAYER_PRIVATE_KEY           — EOA that pays gas to finalize on Arc
 *   RPC                           — Arc Testnet RPC URL
 *
 * Optional env:
 *   CCTP_ATTESTATION_API                — defaults to Circle's testnet API
 *   CCTP_POLL_INTERVAL_MS               — defaults to 15000 (15s)
 *   CCTP_MESSAGE_TRANSMITTER_SEPOLIA    — ETH Sepolia source transmitter
 *   CCTP_MESSAGE_TRANSMITTER_BASE       — Base Sepolia source transmitter
 *   CCTP_MESSAGE_TRANSMITTER_ARB        — Arbitrum Sepolia source transmitter
 *   RPC_SEPOLIA / RPC_BASE / RPC_ARB    — source chain RPCs
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  keccak256,
  decodeEventLog,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, arbitrumSepolia, sepolia } from "viem/chains";
import { env } from "../lib/env";

const ATTESTATION_API =
  process.env.CCTP_ATTESTATION_API ?? "https://iris-api-sandbox.circle.com";
const POLL_INTERVAL = Number(process.env.CCTP_POLL_INTERVAL_MS ?? "15000");
const ARC_DOMAIN = Number(env.cctpArcDomain());

// Circle CCTP v2 testnet MessageTransmitter defaults (overrideable via env).
const DEFAULT_TRANSMITTER_SEPOLIA = "0x7865fAfC2db2093669d92c0197e5116BE2E0F63C";
const DEFAULT_TRANSMITTER_BASE    = "0x7865fAfC2db2093669d92c0197e5116BE2E0F63C";
const DEFAULT_TRANSMITTER_ARB     = "0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872";

const arcChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 421614),
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC ?? "https://sepolia-rollup.arbitrum.io/rpc"] } },
  testnet: true,
});

const MESSAGE_TRANSMITTER_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "usedNonces",
    stateMutability: "view",
    inputs: [{ name: "nonce", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const MESSAGE_SENT_ABI = parseAbi([
  "event MessageSent(bytes message)",
]);

// Circle CCTP message layout (v1/v2):
// version(4) | sourceDomain(4) | destinationDomain(4) | nonce(8) | sender(32) | recipient(32) | destinationCaller(32) | body(...)
const DEST_DOMAIN_OFFSET = 8; // bytes 8-12 hold destinationDomain (big-endian uint32)

interface AttestationResponse {
  status: "complete" | "pending_confirmations" | "notfound";
  attestation?: string;
}

interface PendingMessage {
  messageHash: string;
  messageBytes: string;
}

// Track by messageHash to avoid reprocessing across poll cycles.
const relayed = new Set<string>();
const pendingQueue: PendingMessage[] = [];

// Per-source-chain scan cursor (block number).
const scanCursors = new Map<string, bigint>();

async function fetchAttestation(messageHash: string): Promise<AttestationResponse> {
  const res = await fetch(`${ATTESTATION_API}/v1/attestations/${messageHash}`);
  if (!res.ok) return { status: "notfound" };
  return res.json() as Promise<AttestationResponse>;
}

export function enqueueMessage(messageHash: string, messageBytes: string) {
  if (!relayed.has(messageHash) && !pendingQueue.some((m) => m.messageHash === messageHash)) {
    pendingQueue.push({ messageHash, messageBytes });
    console.log(`[cctp-relayer] Queued message ${messageHash.slice(0, 12)}…`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function relay(
  messageHex: string,
  attestation: string,
  walletClient: any,
  publicClient: any,
  transmitter: `0x${string}`
) {
  try {
    const hash = await walletClient.writeContract({
      address: transmitter,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: "receiveMessage",
      args: [messageHex as `0x${string}`, attestation as `0x${string}`],
      chain: arcChain,
      account: walletClient.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[cctp-relayer] Relayed → Arc tx ${hash} (block ${receipt.blockNumber})`);
    return true;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("nonce") || msg.includes("already")) {
      console.log(`[cctp-relayer] Nonce already used — skipping.`);
      return true;
    }
    console.error(`[cctp-relayer] receiveMessage failed:`, msg);
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tick(walletClient: any, publicClient: any, transmitter: `0x${string}`) {
  if (pendingQueue.length === 0) return;

  for (let i = pendingQueue.length - 1; i >= 0; i--) {
    const { messageHash, messageBytes } = pendingQueue[i];
    if (relayed.has(messageHash)) {
      pendingQueue.splice(i, 1);
      continue;
    }

    const result = await fetchAttestation(messageHash);
    if (result.status === "complete" && result.attestation) {
      const ok = await relay(messageBytes, result.attestation, walletClient, publicClient, transmitter);
      if (ok) {
        relayed.add(messageHash);
        pendingQueue.splice(i, 1);
      }
    } else if (result.status === "notfound") {
      console.log(`[cctp-relayer] ${messageHash.slice(0, 12)}… not found on attestation API`);
    } else {
      console.log(`[cctp-relayer] ${messageHash.slice(0, 12)}… still pending confirmations`);
    }
  }
}

interface SourceChain {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  transmitter: `0x${string}`;
}

async function scanSourceChain(src: SourceChain) {
  const cursorKey = src.label;
  try {
    const latest = await src.client.getBlockNumber();
    const from = scanCursors.get(cursorKey) ?? (latest > 1000n ? latest - 1000n : 0n);
    if (from >= latest) return;

    const logs = await src.client.getLogs({
      address: src.transmitter,
      event: MESSAGE_SENT_ABI[0],
      fromBlock: from,
      toBlock: latest,
    });

    for (const log of logs) {
      const decoded = decodeEventLog({
        abi: MESSAGE_SENT_ABI,
        data: log.data,
        topics: log.topics,
      });
      const messageBytes = (decoded.args as any).message as `0x${string}`;
      const msgBuf = Buffer.from(messageBytes.slice(2), "hex");
      if (msgBuf.length < 12) continue;
      const destDomain = msgBuf.readUInt32BE(DEST_DOMAIN_OFFSET);
      if (destDomain !== ARC_DOMAIN) continue;

      const messageHash = keccak256(messageBytes);
      enqueueMessage(messageHash, messageBytes);
    }

    scanCursors.set(cursorKey, latest + 1n);
  } catch (err: any) {
    console.error(`[cctp-relayer] scan error on ${src.label}:`, err?.message ?? err);
  }
}

async function main() {
  const transmitter = env.cctpMessageTransmitter() as `0x${string}`;
  if (!transmitter) throw new Error("CCTP_MESSAGE_TRANSMITTER_ARC is required");

  const relayerPk = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!relayerPk) throw new Error("RELAYER_PRIVATE_KEY is required");

  const account = privateKeyToAccount(relayerPk);
  const publicClient = createPublicClient({ chain: arcChain, transport: http() });
  const walletClient = createWalletClient({ chain: arcChain, transport: http(), account });

  // Build source chain watchers from env (fall back to Circle testnet defaults).
  const sourceChains: SourceChain[] = [
    {
      label: "sepolia",
      transmitter: (process.env.CCTP_MESSAGE_TRANSMITTER_SEPOLIA ?? DEFAULT_TRANSMITTER_SEPOLIA) as `0x${string}`,
      client: createPublicClient({ chain: sepolia, transport: http(process.env.RPC_SEPOLIA) }),
    },
    {
      label: "base-sepolia",
      transmitter: (process.env.CCTP_MESSAGE_TRANSMITTER_BASE ?? DEFAULT_TRANSMITTER_BASE) as `0x${string}`,
      client: createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_BASE) }),
    },
    {
      label: "arb-sepolia",
      transmitter: (process.env.CCTP_MESSAGE_TRANSMITTER_ARB ?? DEFAULT_TRANSMITTER_ARB) as `0x${string}`,
      client: createPublicClient({ chain: arbitrumSepolia, transport: http(process.env.RPC_ARB) }),
    },
  ];

  console.log(`[cctp-relayer] Started. Relayer: ${account.address}`);
  console.log(`[cctp-relayer] Arc MessageTransmitter: ${transmitter}`);
  console.log(`[cctp-relayer] Arc domain: ${ARC_DOMAIN}`);
  console.log(`[cctp-relayer] Polling every ${POLL_INTERVAL / 1000}s`);
  console.log(`[cctp-relayer] Watching ${sourceChains.length} source chains`);

  for (;;) {
    // Scan all source chains for new MessageSent events destined for Arc.
    await Promise.allSettled(sourceChains.map((sc) => scanSourceChain(sc)));

    // Relay any queued messages that now have a Circle attestation.
    try {
      await tick(walletClient, publicClient, transmitter);
    } catch (err) {
      console.error("[cctp-relayer] tick error:", err);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
