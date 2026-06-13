import type { CancelStatus } from "./types"
import { emptyCancelRecord } from "./types"
import type { CancellationBreakdown } from "./cancellations"
import { occupancyRate } from "./occupancy"

export interface ComparisonRow {
  professionalProfileId: string
  name: string
  availableMinutes: number
  bookedMinutes: number
  occupancy: number | null
  sessions: number
  cancellations: Record<CancelStatus, number>
  cancellationRate: number
  rebooking7: number | null
  revenue: number | null
  avgTicket: number | null
}

/**
 * Merge the per-professional metric sources into comparison rows.
 *
 * `revenueByProf = null` means own-scope without colleague comparison: every
 * row's revenue/avgTicket stays null. `sessions` is taken from the cancellation
 * breakdown's `total` minus cancelled (i.e. non-cancelled CONSULTA in period).
 */
export function buildComparisonRows(parts: {
  profs: Array<{ id: string; name: string }>
  occupancyByProf: Map<string, { available: number; booked: number }>
  cancelByProf: Map<string, CancellationBreakdown>
  sessionsByProf: Map<string, number>
  rebookingByProf: Map<string, number | null>
  revenueByProf: Map<string, { revenue: number; sessions: number }> | null
}): ComparisonRow[] {
  const { profs, occupancyByProf, cancelByProf, sessionsByProf, rebookingByProf, revenueByProf } =
    parts

  return profs.map((p) => {
    const occ = occupancyByProf.get(p.id) ?? { available: 0, booked: 0 }
    const cancel = cancelByProf.get(p.id) ?? {
      total: 0,
      cancelled: 0,
      rate: 0,
      byStatus: emptyCancelRecord(),
    }
    const sessions = sessionsByProf.get(p.id) ?? 0
    const rebooking7 = rebookingByProf.get(p.id) ?? null

    let revenue: number | null = null
    let avgTicket: number | null = null
    if (revenueByProf) {
      const r = revenueByProf.get(p.id)
      if (r) {
        revenue = r.revenue
        avgTicket = r.sessions > 0 ? r.revenue / r.sessions : null
      } else {
        revenue = 0
        avgTicket = null
      }
    }

    return {
      professionalProfileId: p.id,
      name: p.name,
      availableMinutes: occ.available,
      bookedMinutes: occ.booked,
      occupancy: occupancyRate(occ.booked, occ.available),
      sessions,
      cancellations: cancel.byStatus,
      cancellationRate: cancel.rate,
      rebooking7,
      revenue,
      avgTicket,
    }
  })
}
