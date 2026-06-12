export interface WaitlistMetrics {
  /** Number of active (ATIVA) entries currently waiting. */
  waiting: number
  /** Average wait age, in whole days, of the active entries. */
  avgWaitDays: number
  /** Offers sent in the trailing window (caller scopes the input). */
  offersSent30d: number
  /** ACEITA / ENVIADA over the period. 0 when no offers (never NaN). */
  conversionRate: number
  /** Σ sessionFee of the converted entries (null fee treated as 0). */
  revenueRecovered: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Aggregates waitlist metrics from already-scoped input. Pure: the caller is
 * responsible for clinic-scoping and the visibility cut.
 */
export function computeWaitlistMetrics(input: {
  activeEntries: { createdAt: Date }[]
  offers: { status: string; createdAt: Date }[]
  conversions: { sessionFee: number | null }[]
  now: Date
}): WaitlistMetrics {
  const { activeEntries, offers, conversions, now } = input

  const waiting = activeEntries.length

  const avgWaitDays =
    waiting === 0
      ? 0
      : Math.round(
          activeEntries.reduce(
            (sum, e) => sum + (now.getTime() - e.createdAt.getTime()) / MS_PER_DAY,
            0
          ) / waiting
        )

  const offersSent30d = offers.length
  const accepted = offers.filter((o) => o.status === "ACEITA").length
  const conversionRate = offersSent30d === 0 ? 0 : accepted / offersSent30d

  const revenueRecovered = conversions.reduce(
    (sum, c) => sum + (c.sessionFee ?? 0),
    0
  )

  return { waiting, avgWaitDays, offersSent30d, conversionRate, revenueRecovered }
}
