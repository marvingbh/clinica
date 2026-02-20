export interface TimeBlock {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export interface AvailabilityException {
  id: string
  date: string | null
  dayOfWeek: number | null
  isRecurring: boolean
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
  createdAt: string
  isClinicWide: boolean
  professionalName: string | null
}

export interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
  } | null
}

export interface EditingBlock {
  dayOfWeek: number
  index: number | null
  block: TimeBlock
}

export interface EditingException {
  id?: string
  date: string
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
  isFullDay: boolean
  targetType: "clinic" | "professional"
  targetProfessionalId: string | null
}

export const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo", short: "Dom" },
  { value: 1, label: "Segunda", short: "Seg" },
  { value: 2, label: "Terça", short: "Ter" },
  { value: 3, label: "Quarta", short: "Qua" },
  { value: 4, label: "Quinta", short: "Qui" },
  { value: 5, label: "Sexta", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
]
