import type { FiscalRegimeValue, PaymentEvent } from "./types"

function opposite(regime: FiscalRegimeValue): FiscalRegimeValue {
  return regime === "PF" ? "PJ" : "PF"
}

/**
 * Effective regime for a payment on a given date, given the professional's
 * current regime and the date the regime last changed.
 *
 * Without `since`, the current regime always applies. With `since`, payments
 * dated strictly before the switch belong to the *previous* (opposite) regime;
 * payments on or after the switch belong to the current regime. Supports one
 * switch (the previous regime is inferred as the opposite of the current).
 */
export function regimeAtDate(
  current: FiscalRegimeValue,
  since: Date | null,
  paymentDate: Date
): FiscalRegimeValue {
  if (!since) return current
  return paymentDate < startOfDay(since) ? opposite(current) : current
}

export interface ProfessionalRegimeInfo {
  fiscalRegime: FiscalRegimeValue | null
  fiscalRegimeSince: Date | null
}

/**
 * Keeps only the events whose effective regime (per the owning professional)
 * matches `regime`. Professionals with no configured regime are excluded.
 * Events with a null paymentDate are kept (they surface as blockers later) and
 * are evaluated against the current regime since their date is unknown.
 */
export function filterEventsByRegime(
  events: PaymentEvent[],
  professionals: Map<string, ProfessionalRegimeInfo>,
  regime: FiscalRegimeValue
): PaymentEvent[] {
  return events.filter((event) => {
    const prof = professionals.get(event.professionalProfileId)
    if (!prof || !prof.fiscalRegime) return false

    const effective = event.paymentDate
      ? regimeAtDate(prof.fiscalRegime, prof.fiscalRegimeSince, event.paymentDate)
      : prof.fiscalRegime
    return effective === regime
  })
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}
