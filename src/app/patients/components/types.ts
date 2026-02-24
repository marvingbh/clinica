export interface Appointment {
  id: string
  scheduledAt: string
  endAt: string
  status: string
  modality: string
  notes: string | null
  professionalProfile: {
    id: string
    user: {
      name: string
    }
  }
}

export interface ReferenceProfessional {
  id: string
  user: {
    name: string
  }
}

export interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
  } | null
}

export interface AdditionalPhone {
  id?: string
  phone: string
  label: string
  notify: boolean
}

export interface Patient {
  id: string
  name: string
  email: string | null
  phone: string
  birthDate: string | null
  fatherName: string | null
  motherName: string | null
  schoolName: string | null
  firstAppointmentDate: string | null
  lastFeeAdjustmentDate: string | null
  sessionFee: string | number | null
  therapeuticProject: string | null
  notes: string | null
  isActive: boolean
  lastVisitAt: string | null
  consentWhatsApp: boolean
  consentWhatsAppAt: string | null
  consentEmail: boolean
  consentEmailAt: string | null
  createdAt: string
  updatedAt?: string
  cpf?: string | null
  showAppointmentDaysOnInvoice?: boolean
  invoiceMessageTemplate?: string | null
  referenceProfessionalId: string | null
  referenceProfessional: ReferenceProfessional | null
  additionalPhones?: AdditionalPhone[]
  appointments?: Appointment[]
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("pt-BR")
}

export function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-"
  const num = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(num)) return "-"
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const statusLabels: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CANCELADO_ACORDADO: "Desmarcou",
  CANCELADO_FALTA: "Cancelado (Falta)",
  CANCELADO_PROFISSIONAL: "Cancelado (Profissional)",
  FINALIZADO: "Finalizado",
}

export const statusColors: Record<string, string> = {
  AGENDADO: "bg-blue-100 text-blue-800",
  CONFIRMADO: "bg-green-100 text-green-800",
  CANCELADO_ACORDADO: "bg-red-100 text-red-800",
  CANCELADO_FALTA: "bg-yellow-100 text-yellow-800",
  CANCELADO_PROFISSIONAL: "bg-red-100 text-red-800",
  FINALIZADO: "bg-gray-100 text-gray-800",
}
