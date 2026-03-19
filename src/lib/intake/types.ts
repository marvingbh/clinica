import { z } from "zod"

const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

/**
 * Zod schema for public intake form submission
 */
export const intakeSubmissionSchema = z.object({
  childName: z.string().min(2, "Nome da crianca deve ter pelo menos 2 caracteres").max(200),
  childBirthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento invalida"),
  guardianName: z.string().min(2, "Nome do responsavel deve ter pelo menos 2 caracteres").max(200),
  guardianCpfCnpj: z.string().min(11, "CPF/CNPJ invalido").max(18),
  phone: z.string().regex(phoneRegex, "Telefone invalido"),
  email: z.string().email("Email invalido"),
  addressStreet: z.string().min(2, "Endereco obrigatorio").max(300),
  addressNumber: z.string().max(20).optional().default(""),
  addressNeighborhood: z.string().max(100).optional().default(""),
  addressCity: z.string().max(100).optional().default(""),
  addressState: z.string().max(2).optional().default(""),
  addressZip: z.string().regex(/^\d{8}$/, "CEP invalido"),
  schoolName: z.string().max(200).optional().default(""),
  schoolUnit: z.string().max(200).optional().default(""),
  schoolShift: z.string().max(50).optional().default(""),
  motherName: z.string().max(200).optional().default(""),
  motherPhone: z.string().regex(phoneRegex, "Telefone da mae invalido").optional().or(z.literal("")),
  fatherName: z.string().max(200).optional().default(""),
  fatherPhone: z.string().regex(phoneRegex, "Telefone do pai invalido").optional().or(z.literal("")),
  consentPhotoVideo: z.boolean(),
  consentSessionRecording: z.boolean(),
})

export type IntakeSubmissionInput = z.infer<typeof intakeSubmissionSchema>

/**
 * Normalizes phone number to digits only
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

/**
 * Normalizes CPF/CNPJ to digits only
 */
export function normalizeCpfCnpj(value: string): string {
  return value.replace(/\D/g, "")
}
