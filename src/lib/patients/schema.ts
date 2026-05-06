import { z } from "zod"

/**
 * WhatsApp format: optional `+55` country code prefix, two-digit area
 * code, then 8 or 9 subscriber digits. No separators allowed (the form
 * normalizes the input before validation; the API normalizes it before
 * persistence).
 */
export const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

/** Additional phone shape — shared by both the form and the API. */
export const additionalPhoneSchema = z.object({
  phone: z.string().regex(phoneRegex, "Telefone inválido. Use formato WhatsApp: (11) 99999-9999"),
  label: z.string().min(1, "Rótulo é obrigatório").max(30, "Rótulo deve ter no máximo 30 caracteres"),
  notify: z.boolean().default(true),
})

export type AdditionalPhoneInput = z.infer<typeof additionalPhoneSchema>

/**
 * Form-shaped schema used by react-hook-form on the patients page.
 *
 * Numeric/date fields are *strings* here (sessionFee, invoiceDueDay,
 * birthDate in DD/MM/YYYY) because that's what `<input>` produces. The
 * form's onSubmit converts these to API shape before sending. Keeping
 * the form schema close to the input format lets zod produce the right
 * validation errors next to the right field.
 */
export const patientFormSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  phone: z
    .string()
    .min(1, "Telefone é obrigatório")
    .regex(phoneRegex, "Telefone inválido. Use formato: 11999999999"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  cpf: z.string().max(14).optional().or(z.literal("")),
  billingCpf: z.string().max(14).optional().or(z.literal("")),
  billingResponsibleName: z.string().max(200).optional().or(z.literal("")),
  nfseDescriptionTemplate: z.string().max(2000).optional().or(z.literal("")),
  nfsePerAppointment: z.boolean(),
  nfseObs: z.string().max(500).optional().or(z.literal("")),
  addressStreet: z.string().max(200).optional().or(z.literal("")),
  addressNumber: z.string().max(20).optional().or(z.literal("")),
  addressNeighborhood: z.string().max(100).optional().or(z.literal("")),
  addressCity: z.string().max(100).optional().or(z.literal("")),
  addressState: z.string().max(2).optional().or(z.literal("")),
  addressZip: z.string().max(9).optional().or(z.literal("")),
  fatherName: z.string().max(200).optional().or(z.literal("")),
  motherName: z.string().max(200).optional().or(z.literal("")),
  schoolName: z.string().max(200).optional().or(z.literal("")),
  firstAppointmentDate: z.string().optional().or(z.literal("")),
  sessionFee: z.string().optional().or(z.literal("")),
  invoiceDueDay: z.string().optional().or(z.literal("")),
  invoiceGrouping: z.string().optional().or(z.literal("")),
  splitInvoiceByProfessional: z.boolean(),
  lastFeeAdjustmentDate: z.string().optional().or(z.literal("")),
  therapeuticProject: z.string().max(5000).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  referenceProfessionalId: z.string().optional().or(z.literal("")),
  consentWhatsApp: z.boolean(),
  consentEmail: z.boolean(),
})

export type PatientFormData = z.infer<typeof patientFormSchema>

/**
 * API-shaped schema accepted by `POST /api/patients` (and used in the
 * future `PATCH /api/intake-submissions/:id` approve-with-edits path).
 *
 * Numeric/date fields are typed (number, ISO string) because the
 * caller is expected to have already converted from form shape. CPF
 * normalization (digits-only) still happens server-side.
 */
export const patientApiSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  phone: z
    .string()
    .regex(phoneRegex, "Telefone inválido. Use formato WhatsApp: (11) 99999-9999"),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  birthDate: z.string().optional().nullable(),
  cpf: z.string().max(14).optional().nullable().or(z.literal("")),
  billingCpf: z.string().max(14).optional().nullable().or(z.literal("")),
  billingResponsibleName: z.string().max(200).optional().nullable().or(z.literal("")),
  nfseDescriptionTemplate: z.string().max(2000).optional().nullable().or(z.literal("")),
  nfsePerAppointment: z.boolean().optional(),
  nfseObs: z.string().max(500).optional().nullable().or(z.literal("")),
  addressStreet: z.string().max(200).optional().nullable().or(z.literal("")),
  addressNumber: z.string().max(20).optional().nullable().or(z.literal("")),
  addressNeighborhood: z.string().max(100).optional().nullable().or(z.literal("")),
  addressCity: z.string().max(100).optional().nullable().or(z.literal("")),
  addressState: z.string().max(2).optional().nullable().or(z.literal("")),
  addressZip: z.string().max(9).optional().nullable().or(z.literal("")),
  fatherName: z.string().max(200).optional().nullable().or(z.literal("")),
  motherName: z.string().max(200).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable().or(z.literal("")),
  schoolName: z.string().max(200).optional().nullable().or(z.literal("")),
  firstAppointmentDate: z.string().optional().nullable(),
  lastFeeAdjustmentDate: z.string().optional().nullable(),
  sessionFee: z.number().min(0).optional().nullable(),
  therapeuticProject: z.string().max(5000).optional().nullable().or(z.literal("")),
  referenceProfessionalId: z.string().optional().nullable().or(z.literal("")),
  invoiceGrouping: z.enum(["MONTHLY", "PER_SESSION"]).nullable().optional(),
  consentWhatsApp: z.boolean().default(false),
  consentEmail: z.boolean().default(false),
  additionalPhones: z
    .array(additionalPhoneSchema)
    .max(4, "Máximo de 4 telefones adicionais")
    .optional(),
})

export type PatientApiInput = z.infer<typeof patientApiSchema>
