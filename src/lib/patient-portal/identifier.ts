import { isValidPhone, normalizePhone } from "@/lib/phone"

export type PortalIdentifierKind = "phone" | "email"

export interface PortalIdentifier {
  kind: PortalIdentifierKind
  value: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Normalizes a raw login identifier into a phone (digits, optional leading "+")
 * or a lowercased e-mail. Returns null when the input is neither a valid phone
 * nor a valid e-mail.
 *
 * An "@" anywhere routes the value to e-mail validation; otherwise we treat the
 * value as a phone candidate. This keeps the two shapes unambiguous.
 */
export function normalizeIdentifier(raw: string): PortalIdentifier | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  if (trimmed.includes("@")) {
    const email = trimmed.toLowerCase()
    if (!EMAIL_REGEX.test(email)) return null
    return { kind: "email", value: email }
  }

  if (!isValidPhone(trimmed)) return null
  return { kind: "phone", value: normalizePhone(trimmed) }
}
