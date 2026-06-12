export interface PublicProfessional {
  slug: string
  name: string
  specialty: string | null
  bio: string | null
  photoUrl: string | null
}

export interface PublicClinicInfo {
  clinic: { name: string; hasLogo: boolean; phone: string | null }
  settings: { mode: "AUTO_CONFIRM" | "APPROVAL_REQUIRED"; allowedModalities: ("ONLINE" | "PRESENCIAL")[] }
  professionals: PublicProfessional[]
}

export interface PublicSlot {
  start: string // ISO UTC
  end: string // ISO UTC
  label: string // HH:mm SP
}

export interface PublicDaySlots {
  date: string // YYYY-MM-DD SP
  weekday: number
  slots: PublicSlot[]
}

export type Modality = "ONLINE" | "PRESENCIAL"

export interface IdentificationData {
  name: string
  phone: string
  email: string
  cpf?: string
  consent: boolean
  website?: string
}
