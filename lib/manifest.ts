import { keccak256, encodeAbiParameters, parseAbiParameters, stringToBytes, toHex } from "viem";
import type { Manifest } from "./types";

/// Canonical keccak hash of a manifest JSON.
export function manifestHash(manifest: Manifest): `0x${string}` {
  const canon = JSON.stringify(manifest, Object.keys(manifest).sort());
  return keccak256(stringToBytes(canon));
}

/// Stable hash of the sorted mandateCategories — used as the on-chain mandateRoot.
/// (Full Merkle root for >32 categories is overkill for this MVP.)
export function mandateRoot(categories: string[]): `0x${string}` {
  const sorted = [...categories].map((s) => s.trim().toLowerCase()).sort();
  const packed = encodeAbiParameters(parseAbiParameters("string[]"), [sorted]);
  return keccak256(packed);
}

export function categoryAllowed(manifest: Manifest, category: string): boolean {
  const norm = category.trim().toLowerCase();
  return manifest.mandateCategories.some((c) => c.trim().toLowerCase() === norm);
}

export function nameHash(name: string): `0x${string}` {
  return keccak256(stringToBytes(name));
}

export function marketIdHex(label: string): `0x${string}` {
  return keccak256(stringToBytes(label));
}

export { toHex };
