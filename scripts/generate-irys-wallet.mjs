#!/usr/bin/env node
/**
 * Generate a fresh EVM wallet for Irys uploads. Writes the private key into
 * .env as IRYS_PRIVATE_KEY and prints the derived address so you know where
 * to send Sepolia ETH if/when you need to fund larger uploads.
 *
 *   node scripts/generate-irys-wallet.mjs
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const ENV_PATH = path.resolve(process.cwd(), ".env");

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return content.trimEnd() + `\n${line}\n`;
}

function main() {
  if (process.env.IRYS_PRIVATE_KEY) {
    console.error(
      "IRYS_PRIVATE_KEY is already set in .env. Refusing to overwrite. " +
        "Clear it from .env first if you really want to regenerate."
    );
    process.exit(1);
  }
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  let envContent = "";
  if (fs.existsSync(ENV_PATH)) envContent = fs.readFileSync(ENV_PATH, "utf-8");
  envContent = upsertEnv(envContent, "IRYS_PRIVATE_KEY", pk);
  fs.writeFileSync(ENV_PATH, envContent);

  console.log(`Generated Irys wallet.`);
  console.log(`  address: ${account.address}`);
  console.log(`  private key written to ${ENV_PATH} as IRYS_PRIVATE_KEY`);
  console.log("");
  console.log("Devnet uploads under ~100KB are effectively free (no funding");
  console.log("required). If you ever need to upload larger payloads, send a");
  console.log("small amount of Sepolia ETH to the address above. Sepolia");
  console.log("faucet: https://sepoliafaucet.com");
}

main();
