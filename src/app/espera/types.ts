import type { WaitlistPreferences } from "@/lib/waitlist"

/** Shape returned by GET /api/waitlist (see serializeEntry). */
export interface SerializedWaitlistEntry {
  id: string
  status: "ATIVA" | "OFERTADA" | "CONVERTIDA" | "REMOVIDA"
  patientId: string | null
  name: string
  phone: string | null
  isLead: boolean
  professionalProfileId: string | null
  professionalName: string | null
  preferences: WaitlistPreferences
  preferencesSummary: string
  priority: number
  priorityNote: string | null
  removedReason: string | null
  lastOfferedAt: string | null
  createdAt: string
}

export interface WaitlistMetricsData {
  waiting: number
  avgWaitDays: number
  offersSent30d: number
  conversionRate: number
  revenueRecovered: number
}

export type StatusTab = "ATIVA" | "OFERTADA" | "CONVERTIDA" | "REMOVIDA"
