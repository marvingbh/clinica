import { createHmac, timingSafeEqual } from "crypto"

/**
 * Stable internal payment link signing. Mirrors
 * src/lib/appointments/appointment-links.ts. The signature binds the
 * chargeId only — expiration lives in the DB (PaymentCharge.expiresAt),
 * not in the token, so the link survives Stripe session regeneration.
 */

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required for signing payment links")
  }
  return secret
}

export function signChargeLink(chargeId: string): string {
  return createHmac("sha256", getSecret()).update(`charge:${chargeId}`).digest("hex")
}

export function verifyChargeLink(chargeId: string, sig: string): boolean {
  const expected = signChargeLink(chargeId)
  // timing-safe compare; lengths must match for Buffer comparison
  if (typeof sig !== "string" || sig.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export function buildPaymentLinkUrl(baseUrl: string, chargeId: string): string {
  const sig = signChargeLink(chargeId)
  return `${baseUrl}/api/public/pagar/${chargeId}?s=${sig}`
}
