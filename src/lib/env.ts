/**
 * Centralized environment-variable validation.
 *
 * Called once at boot (imported by `auth.ts` + `superadmin-auth.ts` +
 * `appointment-links.ts`). Fails fast with a clear message if any required
 * secret is missing or matches a known-weak placeholder.
 *
 * Domains keep their own validators (e.g. `bank-reconciliation/encryption.ts`
 * asserts `ENCRYPTION_KEY` is 64-hex). This module aggregates the auth-critical
 * secrets so the mistake of leaving a placeholder in a prod deploy throws at
 * boot, not after the first compromise.
 */

const KNOWN_PLACEHOLDERS = new Set([
  "my-super-secret-key-for-development-only-change-in-production",
  "dev-secret",
  "changeme",
  "change-me",
  "secret",
  "password",
  "please-change-me",
])

const MIN_SECRET_LENGTH = 32

export class SecretValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SecretValidationError"
  }
}

function requireStrongSecret(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new SecretValidationError(
      `${name} is required. Generate with \`openssl rand -base64 48\` and set in env.`,
    )
  }
  if (process.env.NODE_ENV === "production") {
    if (KNOWN_PLACEHOLDERS.has(value)) {
      throw new SecretValidationError(
        `${name} matches a known dev placeholder. Refusing to boot in production.`,
      )
    }
    if (value.length < MIN_SECRET_LENGTH) {
      throw new SecretValidationError(
        `${name} is too short (${value.length} chars). Require ≥${MIN_SECRET_LENGTH} chars in production.`,
      )
    }
  }
  return value
}

/**
 * NextAuth session JWT secret. Falls back to `AUTH_SECRET` during the rotation
 * window — `AUTH_SECRET` was the single-secret name before the 3-way split.
 */
export function getNextAuthSecret(): string {
  const v = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  return requireStrongSecret("NEXTAUTH_SECRET", v)
}

/** Superadmin JWT secret. Falls back to `AUTH_SECRET` during rotation window. */
export function getSuperAdminJwtSecret(): string {
  const v = process.env.SUPERADMIN_JWT_SECRET ?? process.env.AUTH_SECRET
  return requireStrongSecret("SUPERADMIN_JWT_SECRET", v)
}

/** HMAC secret for patient-facing confirm/cancel/lookup appointment links. */
export function getAppointmentLinkSecret(): string {
  const v = process.env.APPOINTMENT_LINK_SECRET ?? process.env.AUTH_SECRET
  return requireStrongSecret("APPOINTMENT_LINK_SECRET", v)
}

/**
 * Legacy appointment-link secret accepted during a 24h rotation grace window.
 * When set, `verifyLink` tries both the new and legacy secrets. Remove after
 * 24h. Never falls back; returns null if unset.
 */
export function getLegacyAppointmentLinkSecret(): string | null {
  const v = process.env.LEGACY_APPOINTMENT_LINK_SECRET
  return v && v.trim() !== "" ? v : null
}

/**
 * `ROTATION_REASON=compromise` flag: when set, the legacy-secret grace window
 * is skipped entirely. Use when rotation is triggered by suspected leak.
 */
export function isCompromiseRotation(): boolean {
  return process.env.ROTATION_REASON === "compromise"
}

export function getCronSecret(): string | null {
  const v = process.env.CRON_SECRET
  return v && v.trim() !== "" ? v : null
}
