import { portalDisplayName } from "./guardian"

/**
 * Data-minimization mappers. The portal payload NEVER includes clinical content
 * (appointment/patient notes, therapeutic project), pricing, CPF, or any field
 * not explicitly mapped below. All portal responses MUST go through these.
 */

export interface PortalAppointment {
  id: string
  scheduledAt: string // ISO
  endAt: string // ISO
  status: string
  modality: string | null
  professionalName: string
}

export interface PortalInvoice {
  id: string
  referenceMonth: number
  referenceYear: number
  totalAmount: number
  dueDate: string // ISO date
  status: string
  hasNfse: boolean
  paidAt: string | null
}

export interface PortalPatientProfile {
  id: string
  name: string
  displayName: string
  phone: string
  email: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  consentWhatsApp: boolean
  consentEmail: boolean
}

interface AppointmentInput {
  id: string
  scheduledAt: Date
  endAt: Date
  status: string
  modality: string | null
  professionalProfile: { user: { name: string } }
}

export function toPortalAppointment(appt: AppointmentInput): PortalAppointment {
  return {
    id: appt.id,
    scheduledAt: appt.scheduledAt.toISOString(),
    endAt: appt.endAt.toISOString(),
    status: appt.status,
    modality: appt.modality,
    professionalName: appt.professionalProfile.user.name,
  }
}

interface InvoiceInput {
  id: string
  referenceMonth: number
  referenceYear: number
  totalAmount: { toString(): string } | number
  dueDate: Date
  status: string
  paidAt: Date | null
  /** Invoice-level NFS-e status (canonical column on Invoice). */
  nfseStatus?: string | null
  nfseXml?: string | null
  /** Optional per-item emissions (legacy/secondary source). */
  nfseEmissions?: Array<{ status: string; xml: string | null }>
}

export function toPortalInvoice(invoice: InvoiceInput): PortalInvoice {
  const invoiceLevelNfse = invoice.nfseStatus === "EMITIDA" && !!invoice.nfseXml
  const emissionNfse = (invoice.nfseEmissions ?? []).some(
    (e) => e.status === "EMITIDA" && !!e.xml,
  )
  const hasNfse = invoiceLevelNfse || emissionNfse
  return {
    id: invoice.id,
    referenceMonth: invoice.referenceMonth,
    referenceYear: invoice.referenceYear,
    totalAmount: Number(invoice.totalAmount.toString()),
    dueDate: invoice.dueDate.toISOString(),
    status: invoice.status,
    hasNfse,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
  }
}

interface PatientInput {
  id: string
  name: string
  birthDate: Date | null
  phone: string
  email: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  consentWhatsApp: boolean
  consentEmail: boolean
}

export function toPortalPatient(patient: PatientInput, now: Date = new Date()): PortalPatientProfile {
  return {
    id: patient.id,
    name: patient.name,
    displayName: portalDisplayName({ name: patient.name, birthDate: patient.birthDate }, now),
    phone: patient.phone,
    email: patient.email,
    addressStreet: patient.addressStreet,
    addressNumber: patient.addressNumber,
    addressNeighborhood: patient.addressNeighborhood,
    addressCity: patient.addressCity,
    addressState: patient.addressState,
    addressZip: patient.addressZip,
    consentWhatsApp: patient.consentWhatsApp,
    consentEmail: patient.consentEmail,
  }
}
