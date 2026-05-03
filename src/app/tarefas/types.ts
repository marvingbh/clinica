import type { RecurrenceType, RecurrenceEndType } from "@prisma/client"

// Re-export the shared shape so existing imports keep working.
export type { ProfessionalLite } from "@/lib/professionals/list"

export interface TodoListItem {
  id: string
  clinicId: string
  professionalProfileId: string
  recurrenceId: string | null
  title: string
  notes: string | null
  day: string // ISO datetime as returned by Prisma JSON serialization
  done: boolean
  doneAt: string | null
  order: number
  createdAt: string
  updatedAt: string
  recurrence?: {
    id: string
    recurrenceType: RecurrenceType
    recurrenceEndType: RecurrenceEndType
    endDate: string | null
    occurrences: number | null
    isActive: boolean
  } | null
  professionalProfile: {
    id: string
    user: { name: string }
  }
}

export type StatusFilter = "all" | "open" | "done" | "overdue"
export type RecurrenceFilter = "all" | "none" | "weekly" | "biweekly" | "monthly"
export type SortKey = "title" | "day" | "assignee" | "status"

export interface TodoFormData {
  id?: string
  title: string
  notes: string
  day: string // YYYY-MM-DD
  professionalProfileId: string
  done: boolean
  recurrenceType: "" | RecurrenceType
  recurrenceEndType: RecurrenceEndType
  occurrences: number
  endDate: string
}
