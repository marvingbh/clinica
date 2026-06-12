import type { MatchCandidate } from "./types"

/**
 * True when an offer should be considered expired at `now`: either already
 * past its `expiresAt`, or no longer in the open ENVIADA state.
 */
export function isOfferExpired(
  offer: { status: string; expiresAt: Date },
  now: Date
): boolean {
  if (offer.status !== "ENVIADA") return true
  return offer.expiresAt.getTime() <= now.getTime()
}

/**
 * Computes when an offer should expire: the earlier of (now + holdHours) and
 * the slot start. An offer never outlives the slot it is for.
 */
export function computeOfferExpiry(
  now: Date,
  holdHours: number,
  slotStart: Date
): Date {
  const holdExpiry = now.getTime() + holdHours * 60 * 60 * 1000
  return new Date(Math.min(holdExpiry, slotStart.getTime()))
}

/**
 * Returns the next sequential candidate that has not already been offered this
 * slot, or null when the ranked list is exhausted.
 */
export function nextSequentialCandidate(
  ranked: MatchCandidate[],
  alreadyOfferedEntryIds: Set<string>
): MatchCandidate | null {
  for (const candidate of ranked) {
    if (!alreadyOfferedEntryIds.has(candidate.entry.id)) return candidate
  }
  return null
}
