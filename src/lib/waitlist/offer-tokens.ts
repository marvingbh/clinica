import { createHash, randomBytes } from "crypto"

/**
 * Generates a cryptographically-random opaque offer token (the raw value sent
 * in the public link). Only its SHA-256 hash is stored in the database.
 */
export function generateOfferToken(): string {
  return randomBytes(32).toString("hex")
}

/** SHA-256 hex of a raw offer token — what we persist and look up by. */
export function hashOfferToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Builds the public acceptance URL for an offer token. */
export function buildOfferUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/oferta?token=${token}`
}
