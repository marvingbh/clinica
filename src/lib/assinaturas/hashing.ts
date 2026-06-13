import { createHash } from "crypto"

/** SHA-256 of arbitrary bytes, returned as lowercase hex. */
export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex")
}

/**
 * Case-insensitive comparison of two hex hashes. A simple string compare is
 * fine here (the values are not secrets — they are public document hashes).
 */
export function hashesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
