import { z } from "zod"

const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

/**
 * Validates CPF check digits (modulus 11 algorithm)
 */
function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false // all same digit

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== parseInt(digits[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  return remainder === parseInt(digits[10])
}

/**
 * Validates CNPJ check digits (modulus 11 algorithm)
 */
function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i]
  let remainder = sum % 11
  const d1 = remainder < 2 ? 0 : 11 - remainder
  if (d1 !== parseInt(digits[12])) return false

  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  sum = 0
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i]
  remainder = sum % 11
  const d2 = remainder < 2 ? 0 : 11 - remainder
  return d2 === parseInt(digits[13])
}

/**
 * Validates CPF or CNPJ (digits only, with checksum)
 */
export function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "")
  if (digits.length === 11) return isValidCpf(digits)
  if (digits.length === 14) return isValidCnpj(digits)
  return false
}

/**
 * Zod schema for public intake form submission
 */
export const intakeSubmissionSchema = z.object({
  childName: z.string().min(2, "Nome da crianca deve ter pelo menos 2 caracteres").max(200),
  childBirthDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento invalida")
    .refine((val) => {
      const d = new Date(val)
      return !isNaN(d.getTime()) && d < new Date() && d > new Date("1900-01-01")
    }, "Data de nascimento invalida"),
  guardianName: z.string().min(2, "Nome do responsavel deve ter pelo menos 2 caracteres").max(200),
  guardianCpfCnpj: z.string().min(11, "CPF/CNPJ invalido").max(18)
    .refine((val) => isValidCpfCnpj(val), "CPF/CNPJ invalido"),
  phone: z.string().regex(phoneRegex, "Telefone invalido"),
  email: z.string().email("Email invalido").max(254),
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

/** Partial schema for admin edits */
export const intakeUpdateSchema = intakeSubmissionSchema.partial()

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
