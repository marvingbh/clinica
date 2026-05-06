import type { PatientFormData } from "./schema"

/**
 * Patient shape we read from when populating an edit form. Subset of the
 * full Prisma model that the patient form actually consumes — keeps the
 * coupling explicit.
 */
export interface PatientForFormPrefill {
  name: string
  phone: string
  email?: string | null
  birthDate?: string | Date | null
  cpf?: string | null
  billingCpf?: string | null
  billingResponsibleName?: string | null
  nfseDescriptionTemplate?: string | null
  nfsePerAppointment?: boolean | null
  splitInvoiceByProfessional?: boolean | null
  nfseObs?: string | null
  addressStreet?: string | null
  addressNumber?: string | null
  addressNeighborhood?: string | null
  addressCity?: string | null
  addressState?: string | null
  addressZip?: string | null
  fatherName?: string | null
  motherName?: string | null
  schoolName?: string | null
  firstAppointmentDate?: string | Date | null
  sessionFee?: number | string | null
  invoiceDueDay?: number | string | null
  invoiceGrouping?: string | null
  lastFeeAdjustmentDate?: string | Date | null
  therapeuticProject?: string | null
  notes?: string | null
  referenceProfessionalId?: string | null
  consentWhatsApp: boolean
  consentEmail: boolean
}

/**
 * Subset of IntakeSubmission fields we map onto the form when the
 * operator is approving an intake. Anything not in the intake form
 * stays at the form's default (admin fills in).
 */
export interface IntakeSubmissionForFormPrefill {
  childName: string
  childBirthDate: string | Date
  guardianName: string
  guardianCpfCnpj: string | null
  phone: string
  email: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  schoolName: string | null
  fatherName: string | null
  motherName: string | null
}

export interface AdditionalPhonePayload {
  id?: string
  phone: string
  label: string
}

export interface BuildPayloadInput {
  data: PatientFormData
  additionalPhones: { id?: string; phone: string; label: string }[]
}

/** ISO date (`YYYY-MM-DD` or full ISO) → `DD/MM/YYYY` for display in inputs. */
export function isoToBrDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return ""
  const d = dateString instanceof Date ? dateString : new Date(dateString)
  if (isNaN(d.getTime())) return ""
  const day = String(d.getUTCDate()).padStart(2, "0")
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

/** `DD/MM/YYYY` → ISO `YYYY-MM-DD` for the API. Empty string when invalid. */
export function brDateToIso(brDate: string): string {
  if (!brDate) return ""
  const parts = brDate.split("/")
  if (parts.length !== 3) return ""
  const [day, month, year] = parts
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

/** Empty defaults for a fresh "create patient" form. */
export function defaultPatientFormValues(): PatientFormData {
  return {
    name: "",
    phone: "",
    email: "",
    birthDate: "",
    cpf: "",
    billingCpf: "",
    billingResponsibleName: "",
    nfseDescriptionTemplate: "",
    nfsePerAppointment: false,
    splitInvoiceByProfessional: false,
    nfseObs: "",
    addressStreet: "",
    addressNumber: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
    addressZip: "",
    fatherName: "",
    motherName: "",
    schoolName: "",
    firstAppointmentDate: "",
    sessionFee: "",
    invoiceDueDay: "",
    invoiceGrouping: "",
    lastFeeAdjustmentDate: "",
    therapeuticProject: "",
    notes: "",
    referenceProfessionalId: "",
    consentWhatsApp: false,
    consentEmail: false,
  }
}

/** Build form values from an existing Patient (edit mode). */
export function patientToFormData(patient: PatientForFormPrefill): PatientFormData {
  return {
    name: patient.name,
    phone: patient.phone,
    email: patient.email ?? "",
    birthDate: isoToBrDate(patient.birthDate),
    cpf: patient.cpf ?? "",
    billingCpf: patient.billingCpf ?? "",
    billingResponsibleName: patient.billingResponsibleName ?? "",
    nfseDescriptionTemplate: patient.nfseDescriptionTemplate ?? "",
    nfsePerAppointment: patient.nfsePerAppointment ?? false,
    splitInvoiceByProfessional: patient.splitInvoiceByProfessional ?? false,
    nfseObs: patient.nfseObs ?? "",
    addressStreet: patient.addressStreet ?? "",
    addressNumber: patient.addressNumber ?? "",
    addressNeighborhood: patient.addressNeighborhood ?? "",
    addressCity: patient.addressCity ?? "",
    addressState: patient.addressState ?? "",
    addressZip: patient.addressZip ?? "",
    fatherName: patient.fatherName ?? "",
    motherName: patient.motherName ?? "",
    schoolName: patient.schoolName ?? "",
    firstAppointmentDate: isoToBrDate(patient.firstAppointmentDate),
    sessionFee: patient.sessionFee != null ? String(patient.sessionFee) : "",
    invoiceDueDay: patient.invoiceDueDay != null ? String(patient.invoiceDueDay) : "",
    invoiceGrouping: patient.invoiceGrouping ?? "",
    lastFeeAdjustmentDate: isoToBrDate(patient.lastFeeAdjustmentDate),
    therapeuticProject: patient.therapeuticProject ?? "",
    notes: patient.notes ?? "",
    referenceProfessionalId: patient.referenceProfessionalId ?? "",
    consentWhatsApp: patient.consentWhatsApp,
    consentEmail: patient.consentEmail,
  }
}

/**
 * Build form values from an IntakeSubmission. Maps the customer-provided
 * fields and leaves admin-only fields (sessionFee, referenceProfessional,
 * therapeuticProject, etc.) blank for the operator to fill in.
 *
 * Note: the intake form captures the *guardian's* CPF in
 * `guardianCpfCnpj` and the *guardian's* name in `guardianName`. Those
 * map to `billingCpf` / `billingResponsibleName` on the patient, not to
 * the patient's own `cpf`/`name`.
 */
export function intakeSubmissionToFormData(
  submission: IntakeSubmissionForFormPrefill,
): PatientFormData {
  return {
    ...defaultPatientFormValues(),
    name: submission.childName,
    birthDate: isoToBrDate(submission.childBirthDate),
    phone: submission.phone,
    email: submission.email ?? "",
    billingCpf: submission.guardianCpfCnpj ?? "",
    billingResponsibleName: submission.guardianName,
    addressStreet: submission.addressStreet ?? "",
    addressNumber: submission.addressNumber ?? "",
    addressNeighborhood: submission.addressNeighborhood ?? "",
    addressCity: submission.addressCity ?? "",
    addressState: submission.addressState ?? "",
    addressZip: submission.addressZip ?? "",
    schoolName: submission.schoolName ?? "",
    fatherName: submission.fatherName ?? "",
    motherName: submission.motherName ?? "",
  }
}

/**
 * Build the API payload from form values + the separately-managed
 * additionalPhones state. Mirrors the existing onSubmit body shape.
 */
export function buildPatientPayload({
  data,
  additionalPhones,
}: BuildPayloadInput): Record<string, unknown> {
  return {
    name: data.name,
    phone: data.phone.replace(/\D/g, ""),
    email: data.email || null,
    birthDate: brDateToIso(data.birthDate || "") || null,
    cpf: data.cpf || null,
    billingCpf: data.billingCpf || null,
    billingResponsibleName: data.billingResponsibleName || null,
    nfseDescriptionTemplate: data.nfseDescriptionTemplate || null,
    nfsePerAppointment: data.nfsePerAppointment,
    splitInvoiceByProfessional: data.splitInvoiceByProfessional,
    nfseObs: data.nfseObs || null,
    addressStreet: data.addressStreet || null,
    addressNumber: data.addressNumber || null,
    addressNeighborhood: data.addressNeighborhood || null,
    addressCity: data.addressCity || null,
    addressState: data.addressState || null,
    addressZip: data.addressZip?.replace(/\D/g, "") || null,
    fatherName: data.fatherName || null,
    motherName: data.motherName || null,
    schoolName: data.schoolName || null,
    firstAppointmentDate: brDateToIso(data.firstAppointmentDate || "") || null,
    sessionFee: data.sessionFee ? parseFloat(data.sessionFee) : null,
    invoiceDueDay: data.invoiceDueDay ? parseInt(data.invoiceDueDay) : null,
    invoiceGrouping: data.invoiceGrouping || null,
    lastFeeAdjustmentDate: brDateToIso(data.lastFeeAdjustmentDate || "") || null,
    therapeuticProject: data.therapeuticProject || null,
    notes: data.notes || null,
    referenceProfessionalId: data.referenceProfessionalId || null,
    consentWhatsApp: data.consentWhatsApp,
    consentEmail: data.consentEmail,
    additionalPhones: additionalPhones
      .filter((p) => p.phone.trim() && p.label.trim())
      .map((p) => ({
        id: p.id,
        phone: p.phone.replace(/\D/g, ""),
        label: p.label.trim(),
      })),
  }
}
