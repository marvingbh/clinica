export interface BookingSettingsState {
  enabled: boolean
  mode: "AUTO_CONFIRM" | "APPROVAL_REQUIRED"
  sessionDurationMinutes: number
  minAdvanceHours: number
  horizonDays: number
  allowedModalities: ("ONLINE" | "PRESENCIAL")[]
  maxOpenBookingsPerPhone: number
  blockedPhones: string[]
}

export interface ProfessionalRow {
  id: string // User id
  name: string
  professionalProfileId: string | null
  allowOnlineBooking: boolean
  publicBookingSlug: string | null
  hasAvailability: boolean
  appointmentDuration: number | null
  bufferBetweenSlots: number | null
}
