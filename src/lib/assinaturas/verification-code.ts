import { randomInt } from "crypto"

/** Alphabet without visually ambiguous characters (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const GROUP_LEN = 4
const GROUPS = 3

/**
 * Generates a public verification code: 3 groups of 4 chars, e.g.
 * `K7XF-2MQ9-PA4D`. Printed on the signature page and resolvable at
 * `/verificar/[code]`.
 */
export function generateVerificationCode(): string {
  const groups: string[] = []
  for (let g = 0; g < GROUPS; g++) {
    let group = ""
    for (let i = 0; i < GROUP_LEN; i++) {
      group += ALPHABET[randomInt(0, ALPHABET.length)]
    }
    groups.push(group)
  }
  return groups.join("-")
}

/** Normalizes user input: uppercase, strips everything but the alphabet. */
export function normalizeVerificationCode(input: string): string {
  return (input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * Validates that the input, once normalized, has the expected length and
 * uses only allowed (non-ambiguous) characters.
 */
export function isValidVerificationCodeFormat(input: string): boolean {
  const normalized = normalizeVerificationCode(input)
  if (normalized.length !== GROUP_LEN * GROUPS) return false
  return [...normalized].every((c) => ALPHABET.includes(c))
}

/** Re-applies the hyphen grouping to a normalized code for display/lookup. */
export function formatVerificationCode(normalized: string): string {
  const clean = normalizeVerificationCode(normalized)
  const parts: string[] = []
  for (let i = 0; i < clean.length; i += GROUP_LEN) {
    parts.push(clean.slice(i, i + GROUP_LEN))
  }
  return parts.join("-")
}
