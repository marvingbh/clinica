import type { CancelStatus } from "./types"
import { CANCEL_STATUSES, emptyCancelRecord, BR_TZ_OFFSET_MINUTES } from "./types"

export interface ApptStatusSlim {
  status: string
  scheduledAt: Date
}

const CANCEL_SET = new Set<string>(CANCEL_STATUSES)

export interface CancellationBreakdown {
  total: number
  cancelled: number
  rate: number
  byStatus: Record<CancelStatus, number>
}

/**
 * Breakdown of cancellations across the three cancel statuses.
 * `total` = all CONSULTA in the period; `rate` = cancelled ÷ total (0 when empty).
 */
export function cancellationBreakdown(appts: ApptStatusSlim[]): CancellationBreakdown {
  const byStatus = emptyCancelRecord()
  let cancelled = 0
  for (const a of appts) {
    if (CANCEL_SET.has(a.status)) {
      byStatus[a.status as CancelStatus]++
      cancelled++
    }
  }
  const total = appts.length
  const rate = total === 0 ? 0 : cancelled / total
  return { total, cancelled, rate, byStatus }
}

export interface HeatmapCell {
  dayOfWeek: number // 0 = Sunday
  hour: number // 6..22
  total: number
  byStatus: Record<CancelStatus, number>
}

const HEATMAP_MIN_HOUR = 6
const HEATMAP_MAX_HOUR = 22

/**
 * Cancellations bucketed by local day-of-week × hour. Only cancelled CONSULTA
 * are counted. Hours below 6 / above 22 clamp into the edge buckets (06h, 22h).
 * Returns a dense 7×17 grid (Sun..Sat × 06..22h).
 */
export function cancellationHeatmap(
  appts: ApptStatusSlim[],
  tzOffsetMinutes: number = BR_TZ_OFFSET_MINUTES
): HeatmapCell[] {
  const cells: HeatmapCell[] = []
  const index = new Map<string, HeatmapCell>()
  for (let d = 0; d < 7; d++) {
    for (let h = HEATMAP_MIN_HOUR; h <= HEATMAP_MAX_HOUR; h++) {
      const cell: HeatmapCell = {
        dayOfWeek: d,
        hour: h,
        total: 0,
        byStatus: emptyCancelRecord(),
      }
      cells.push(cell)
      index.set(`${d}-${h}`, cell)
    }
  }

  for (const a of appts) {
    if (!CANCEL_SET.has(a.status)) continue
    const shifted = new Date(a.scheduledAt.getTime() + tzOffsetMinutes * 60_000)
    const dow = shifted.getUTCDay()
    let hour = shifted.getUTCHours()
    if (hour < HEATMAP_MIN_HOUR) hour = HEATMAP_MIN_HOUR
    if (hour > HEATMAP_MAX_HOUR) hour = HEATMAP_MAX_HOUR
    const cell = index.get(`${dow}-${hour}`)
    if (!cell) continue
    cell.total++
    cell.byStatus[a.status as CancelStatus]++
  }

  return cells
}
