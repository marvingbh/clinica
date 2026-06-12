/**
 * Pure anti-abuse predicates for the public booking flow. The persistence-bound
 * checks (rate limits, open-booking counts) live in the route; these are the
 * pure decision helpers that operate on already-fetched data.
 */

/**
 * True when the (already normalized) phone is on the clinic's blocklist.
 * Both sides are compared after normalization by the caller.
 */
export function isPhoneBlocked(blockedPhones: string[], normalizedPhone: string): boolean {
  return blockedPhones.includes(normalizedPhone)
}

/** True when the visitor already has `openCount` open bookings and `max` is reached. */
export function exceedsOpenBookingLimit(openCount: number, max: number): boolean {
  return openCount >= max
}

/** True when the hidden honeypot field was filled — a strong bot signal. */
export function isHoneypotTripped(input: { website?: string }): boolean {
  return typeof input.website === "string" && input.website.trim().length > 0
}
