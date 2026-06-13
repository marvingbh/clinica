import { createHmac, randomInt, timingSafeEqual } from "crypto"

/** OTP time-to-live, in minutes. */
export const OTP_TTL_MINUTES = 10
/** Maximum number of verification attempts before a code is locked. */
export const OTP_MAX_ATTEMPTS = 5

/** Generates a 6-digit OTP (zero-padded, includes leading zeros). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/**
 * HMAC-SHA256 of `requestId:code` keyed by `secret` (the app AUTH_SECRET).
 * Binding the requestId prevents a code minted for one request from
 * validating against another.
 */
export function hashOtpCode(secret: string, requestId: string, code: string): string {
  return createHmac("sha256", secret).update(`${requestId}:${code}`).digest("hex")
}

/** Timing-safe verification of a submitted OTP against a stored hash. */
export function verifyOtpCode(args: {
  secret: string
  requestId: string
  code: string
  codeHash: string
}): boolean {
  const expected = hashOtpCode(args.secret, args.requestId, args.code)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(args.codeHash, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type OtpUnusableReason = "expired" | "consumed" | "too_many_attempts"

/** Determines whether a stored OTP can still be verified. */
export function isOtpUsable(
  otp: { expiresAt: Date; consumedAt: Date | null; attempts: number },
  now: Date
): { usable: boolean; reason?: OtpUnusableReason } {
  if (otp.consumedAt) return { usable: false, reason: "consumed" }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return { usable: false, reason: "too_many_attempts" }
  if (now.getTime() > otp.expiresAt.getTime()) return { usable: false, reason: "expired" }
  return { usable: true }
}

/**
 * Masks an email or phone for display in confirmations.
 * Email: `m***a@g***.com`. Phone: `(**) *****-1234`.
 */
export function maskContact(emailOrPhone: string): string {
  const value = (emailOrPhone ?? "").trim()
  if (value.includes("@")) return maskEmail(value)
  return maskPhone(value)
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return email
  const maskedLocal = maskMiddle(local)
  const dotIdx = domain.lastIndexOf(".")
  if (dotIdx <= 0) return `${maskedLocal}@${maskMiddle(domain)}`
  const host = domain.slice(0, dotIdx)
  const tld = domain.slice(dotIdx) // includes the dot
  return `${maskedLocal}@${maskMiddle(host)}${tld}`
}

function maskMiddle(s: string): string {
  if (s.length <= 1) return s
  if (s.length === 2) return `${s[0]}*`
  return `${s[0]}***${s[s.length - 1]}`
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 4) return "****"
  const last4 = digits.slice(-4)
  return `(**) *****-${last4}`
}
