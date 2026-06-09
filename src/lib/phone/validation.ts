/**
 * Shared phone validation/normalization for patient and intake forms.
 *
 * Two accepted shapes (after normalization — digits plus optional leading "+"):
 * - Brazilian (default): optional 55/+55 country code, 2-digit area code,
 *   8 or 9 subscriber digits (e.g. "11999999999", "+5511999999999")
 * - International: leading "+" followed by 8–15 digits, E.164-style
 *   (e.g. "+4791234567")
 */
export const phoneRegex = /^(?:(?:\+?55)?\d{10,11}|\+\d{8,15})$/

export const PHONE_ERROR_MESSAGE =
  "Telefone inválido. Use (11) 99999-9999 ou formato internacional com + (ex: +351912345678)"

/**
 * Strips formatting from user input, keeping digits and a leading "+" only.
 * "(11) 99999-9999" → "11999999999"; "+47 912 34 567" → "+4791234567"
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  return value.trim().startsWith("+") ? `+${digits}` : digits
}

/** True when the phone is valid after normalization (input-mask tolerant). */
export function isValidPhone(value: string): boolean {
  return phoneRegex.test(normalizePhone(value))
}

/**
 * Masks input as a Brazilian phone by default. A leading "+" switches to
 * free international entry (digits only, E.164 max of 15).
 */
export function formatPhoneInput(value: string): string {
  if (value.trim().startsWith("+")) {
    return `+${value.replace(/\D/g, "").slice(0, 15)}`
  }
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Formats a stored (normalized) phone for display. Brazilian numbers get the
 * local mask; international numbers (leading "+", non-55) pass through as-is.
 */
export function formatPhoneDisplay(phone: string): string {
  if (phone.startsWith("+") && !phone.startsWith("+55")) return phone
  const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}
