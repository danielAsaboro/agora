#!/usr/bin/env node
/**
 * Generate a Circle entity secret, register the ciphertext with Circle, and
 * write the plaintext into agora/.env.
 *
 *   node scripts/generate-entity-secret.mjs
 *
 * Requires CIRCLE_API_KEY already set in .env. Writes:
 *   - CIRCLE_ENTITY_SECRET in .env (plaintext, kept locally; do not commit)
 *   - recovery/<timestamp>-recovery.dat (binary recovery file from Circle —
 *     MOVE OFFLINE TO A SECURE LOCATION. Circle does not store the secret.)
 *
 * This is a one-shot setup operation per Circle entity. Running it again
 * will fail with "entity secret already registered" — that is expected.
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const ENV_PATH = path.resolve(process.cwd(), ".env");
const RECOVERY_DIR = path.resolve(process.cwd(), "recovery");

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return content.trimEnd() + `\n${line}\n`;
}

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) die("CIRCLE_API_KEY is unset in .env. Add it before running.");

  if (process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_ENTITY_SECRET.length > 0) {
    die(
      "CIRCLE_ENTITY_SECRET is already set in .env. Refusing to overwrite. " +
        "Clear it from .env first if you really want to regenerate (this " +
        "will rotate your entity — back up the existing recovery file first)."
    );
  }

  console.log("Generating entity secret...");
  const entitySecret = crypto.randomBytes(32).toString("hex");
  console.log(`Generated 32-byte secret (${entitySecret.length} hex chars).`);

  console.log("Registering ciphertext with Circle...");
  fs.mkdirSync(RECOVERY_DIR, { recursive: true });
  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: RECOVERY_DIR,
  });
  const recoveryFile = response.data?.recoveryFile;
  console.log("Registration OK.");
  if (recoveryFile) {
    console.log("Recovery file (base64):");
    console.log(recoveryFile.slice(0, 80) + "..." + recoveryFile.slice(-40));
  }

  let envContent = "";
  if (fs.existsSync(ENV_PATH)) envContent = fs.readFileSync(ENV_PATH, "utf-8");
  envContent = upsertEnv(envContent, "CIRCLE_ENTITY_SECRET", entitySecret);
  fs.writeFileSync(ENV_PATH, envContent);
  console.log(`Wrote CIRCLE_ENTITY_SECRET to ${ENV_PATH}.`);
  console.log("");
  console.log("NEXT STEPS:");
  console.log(`  1. Back up the recovery file in ${RECOVERY_DIR}/ to a secure offline location.`);
  console.log(`  2. The plaintext secret is in .env (gitignored).`);
  console.log(`  3. You can now create Circle wallets — run: npm run register:all`);
}

main().catch((err) => {
  console.error("registration failed:", err?.message || err);
  if (err?.response?.data) console.error(err.response.data);
  process.exit(1);
});
