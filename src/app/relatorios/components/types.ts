/** Client-side mirrors of the /api/relatorios JSON responses. */

export type CancelStatus =
  | "CANCELADO_ACORDADO"
  | "CANCELADO_FALTA"
  | "CANCELADO_PROFISSIONAL"

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

export interface OverviewResponse {
  period: string
  totals: {
    occupancy: number | null
    sessions: number
    cancellationRate: number
    rebooking7: number | null
    rebooking30: number | null
    newPatients: number
  }
  professionals: ComparisonRow[]
  trend: Array<{ label: string; sessions: number; cancelled: number }>
}

export interface RetentionResponse {
  period: string
  cohortSize: number
  reached2ndPct: number | null
  reached5thPct: number | null
  avgSessionsPerPatient: number | null
  medianLifetimeSessions: number | null
  active30: number
  active60: number
  dropped: number
  smallSample: boolean
  dropped_list: Array<{
    patientId: string
    name: string
    lastSessionAt: string | null
    referenceProfessionalName: string | null
  }>
}

export interface CancelBreakdown {
  total: number
  cancelled: number
  rate: number
  byStatus: Record<CancelStatus, number>
}

export interface HeatmapCell {
  dayOfWeek: number
  hour: number
  total: number
  byStatus: Record<CancelStatus, number>
}

export interface CancellationsResponse {
  period: string
  totals: CancelBreakdown
  byProfessional: Array<{ professionalProfileId: string; name: string } & CancelBreakdown>
  heatmap: HeatmapCell[]
}

export interface OriginsResponse {
  period: string
  bySource: Array<{
    source: string
    label: string
    count: number
    converted: number
    conversionPct: number | null
  }>
  byMonth: Array<{ year: number; month: number; bySource: Record<string, number> }>
  total: number
}

export interface GroupsResponse {
  period: string
  groups: Array<{
    groupId: string
    groupName: string
    professionalName: string
    sessions: number
    avgPresent: number
    capacity: number
    occupancyPct: number | null
    faltas: number
  }>
}
