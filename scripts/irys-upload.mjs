#!/usr/bin/env node
/**
 * Upload a JSON payload (or arbitrary bytes) to Irys devnet, signed with
 * IRYS_PRIVATE_KEY. Prints the Irys transaction id on stdout.
 *
 * Usage:
 *   echo '{"hello":"world"}' | node scripts/irys-upload.mjs
 *
 * stdin -> raw bytes to pin
 * stdout -> 0x... irys tx id
 * stderr -> human-readable progress (ignored by callers)
 *
 * Env:
 *   IRYS_PRIVATE_KEY  64-hex EVM private key (0x-prefixed or bare)
 *   IRYS_NETWORK      "devnet" (default) | "mainnet"
 *
 * Devnet uses Sepolia ETH as the funding token. Small uploads (< 100KB) are
 * effectively free; the SDK still requires the wallet to exist but does not
 * require an on-chain balance for tiny payloads.
 */
import "dotenv/config";
import { Uploader } from "@irys/upload";
import { Ethereum } from "@irys/upload-ethereum";

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks);
}

function die(msg, code = 1) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}

async function main() {
  let pk = process.env.IRYS_PRIVATE_KEY;
  if (!pk) die("IRYS_PRIVATE_KEY is unset");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const network = process.env.IRYS_NETWORK || "devnet";

  const body = await readStdin();
  if (body.length === 0) die("stdin was empty; nothing to upload");

  const sepoliaRpc =
    process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";

  const uploader = await Uploader(Ethereum)
    .withWallet(pk)
    .withRpc(sepoliaRpc)
    .devnet();
  process.stderr.write(`irys address: ${uploader.address}\n`);
  process.stderr.write(`uploading ${body.length} bytes to ${network}...\n`);

  // Tags help identify this data on the gateway side.
  const tags = [
    { name: "App", value: "agora" },
    { name: "Content-Type", value: "application/json" },
  ];
  const extra = process.env.IRYS_EXTRA_TAGS;
  if (extra) {
    for (const pair of extra.split(",")) {
      const [k, v] = pair.split("=");
      if (k && v) tags.push({ name: k.trim(), value: v.trim() });
    }
  }

  const receipt = await uploader.upload(body, { tags });
  process.stdout.write(receipt.id);
  process.stderr.write(`\nirys id: ${receipt.id}\n`);
}

main().catch((err) => {
  process.stderr.write("irys upload failed: " + (err?.message || err) + "\n");
  if (err?.cause) process.stderr.write("cause: " + err.cause + "\n");
  process.exit(2);
});
