export type BookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"

export interface BookingRequestItem {
  id: string
  status: BookingStatus
  scheduledAt: string
  endAt: string
  modality: "ONLINE" | "PRESENCIAL"
  name: string
  phone: string
  email: string
  cpf: string | null
  patientId: string | null
  rejectionReason: string | null
  createdAt: string
  professionalProfile: { id: string; user: { name: string } }
  patient: { id: string; name: string } | null
}
