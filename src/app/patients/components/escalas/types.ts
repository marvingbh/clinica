/** Shapes returned by the escalas API routes, used across the tab components. */

export interface AdministrationRow {
  id: string
  scaleCode: string
  source: string
  status: string
  answers: Record<string, number>
  totalScore: number | null
  severityLabel: string | null
  riskFlag: boolean
  sentAt: string | null
  completedAt: string | null
  createdAt: string
  professionalProfile?: { user: { name: string } }
}

export interface ScheduleRow {
  id: string
  scaleCode: string
  cadenceType: string
  intervalWeeks: number | null
  active: boolean
  pausedReason: string | null
  lastSentAt: string | null
}

export interface ScaleOption {
  code: string
  name: string
  shortName: string
}

export interface MetadataRow {
  id: string
  scaleCode: string
  shortName: string
  status: string
  source: string
  sentAt: string | null
  completedAt: string | null
  createdAt: string
}
