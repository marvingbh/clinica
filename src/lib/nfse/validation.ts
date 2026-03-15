import { z } from "zod"

// ============================================================================
// CNPJ Validation
// ============================================================================

const CNPJ_WEIGHTS_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const CNPJ_WEIGHTS_SECOND = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

function calcCheckDigit(digits: number[], weights: number[]): number {
  const sum = weights.reduce((acc, w, i) => acc + digits[i] * w, 0)
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

/** Validates a CNPJ string (with or without formatting). */
export function validateCnpj(cnpj: string): boolean {
  const stripped = cnpj.replace(/\D/g, "")

  if (stripped.length !== 14) return false

  // Reject all-same-digit CNPJs (e.g. 11111111111111)
  if (/^(\d)\1{13}$/.test(stripped)) return false

  const digits = stripped.split("").map(Number)

  const firstCheck = calcCheckDigit(digits.slice(0, 12), CNPJ_WEIGHTS_FIRST)
  if (digits[12] !== firstCheck) return false

  const secondCheck = calcCheckDigit(digits.slice(0, 13), CNPJ_WEIGHTS_SECOND)
  if (digits[13] !== secondCheck) return false

  return true
}

// ============================================================================
// Zod Schemas
// ============================================================================

const codigoMunicipioRegex = /^\d{7}$/

/** Schema for NFS-e configuration (clinic-level settings). */
export const nfseConfigSchema = z.object({
  cnpj: z
    .string()
    .min(1, "CNPJ obrigatório")
    .transform((val) => val.replace(/\D/g, ""))
    .refine((val) => validateCnpj(val), { message: "CNPJ inválido" }),
  inscricaoMunicipal: z.string().min(1, "Inscrição municipal obrigatória"),
  codigoMunicipio: z
    .string()
    .regex(codigoMunicipioRegex, "Código do município deve ter 7 dígitos"),
  regimeTributario: z.string().min(1, "Regime tributário obrigatório"),
  codigoServico: z.string().min(1, "Código de serviço obrigatório"),
  codigoServicoMunicipal: z.string().max(3).optional().or(z.literal("")),
  cnae: z.string().optional(),
  codigoNbs: z.string().optional(),
  aliquotaIss: z.number().min(0).max(100),
  descricaoServico: z.string().optional(),
  useSandbox: z.boolean(),
})

export type NfseConfigFormData = z.infer<typeof nfseConfigSchema>

/** Schema for per-invoice NFS-e emission overrides. */
export const nfseEmissionOverrideSchema = z.object({
  codigoServico: z.string().min(1).optional(),
  descricao: z.string().min(1).optional(),
  aliquotaIss: z.number().min(0).max(100).optional(),
})

export type NfseEmissionOverrideData = z.infer<typeof nfseEmissionOverrideSchema>
