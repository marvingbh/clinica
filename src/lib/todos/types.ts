import type { RecurrenceType, RecurrenceEndType } from "@prisma/client"

export interface TodoRecurrenceInput {
  recurrenceType: RecurrenceType
  recurrenceEndType: RecurrenceEndType
  startDate: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD (BY_DATE)
  occurrences?: number // BY_OCCURRENCES
}

export interface TodoView {
  id: string
  clinicId: string
  professionalProfileId: string
  recurrenceId: string | null
  title: string
  notes: string | null
  day: string // YYYY-MM-DD (serialized)
  done: boolean
  doneAt: string | null
  order: number
  createdAt: string
  updatedAt: string
}

export interface TodoRecurrenceView {
  id: string
  clinicId: string
  professionalProfileId: string
  title: string
  notes: string | null
  dayOfWeek: number
  recurrenceType: RecurrenceType
  recurrenceEndType: RecurrenceEndType
  startDate: string
  endDate: string | null
  occurrences: number | null
  exceptions: string[]
  lastGeneratedDate: string | null
  isActive: boolean
}

export interface TodoFilters {
  from?: string // YYYY-MM-DD
  to?: string // YYYY-MM-DD
  status?: "all" | "open" | "done" | "overdue"
  assignee?: string // professionalProfileId or "all"
  recurrence?: "all" | "none" | "weekly" | "biweekly" | "monthly"
  q?: string // search title + notes
}

export interface TodoStats {
  total: number
  open: number
  done: number
  overdue: number
}
