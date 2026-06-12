import { createHmac, randomInt, timingSafeEqual } from "crypto"

export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
/** Anti-abuse: max OTP requests per identifier inside the window below. */
export const OTP_MAX_REQUESTS_PER_WINDOW = 3
export const OTP_REQUEST_WINDOW_MINUTES = 15

/** Generates a uniformly random 6-digit code as a zero-padded string. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/**
 * Deterministic HMAC of an OTP code, scoped to a clinic + identifier so the
 * same code never validates across tenants. The plaintext code is never stored.
 */
export function hashOtpCode(
  secret: string,
  clinicId: string,
  identifier: string,
  code: string,
): string {
  return createHmac("sha256", secret)
    .update(`${clinicId}:${identifier}:${code}`)
    .digest("hex")
}

/** Timing-safe comparison of a submitted code against a stored hash. */
export function verifyOtpCode(args: {
  secret: string
  clinicId: string
  identifier: string
  code: string
  codeHash: string
}): boolean {
  const expected = hashOtpCode(args.secret, args.clinicId, args.identifier, args.code)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(args.codeHash, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type OtpUnusableReason = "expired" | "consumed" | "too_many_attempts"

export interface OtpUsability {
  usable: boolean
  reason?: OtpUnusableReason
}

/** Whether a stored OTP can still be verified at `now`. */
export function isOtpUsable(
  otp: { expiresAt: Date; consumedAt: Date | null; attempts: number },
  now: Date,
): OtpUsability {
  if (otp.consumedAt) return { usable: false, reason: "consumed" }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return { usable: false, reason: "too_many_attempts" }
  if (now.getTime() >= otp.expiresAt.getTime()) return { usable: false, reason: "expired" }
  return { usable: true }
}

/** Expiry timestamp for a freshly created OTP. */
export function otpExpiry(now: Date): Date {
  return new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000)
}
