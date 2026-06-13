import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/intake/types"

/** Normalizes a CPF to its 11 digits (strips mask). */
export function normalizeCpf(cpf: string): string {
  return normalizeCpfCnpj(cpf)
}

/** Validates a CPF (exactly 11 digits + check digits). Rejects CNPJ. */
export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf)
  if (digits.length !== 11) return false
  return isValidCpfCnpj(digits)
}

/** Formats 11 digits as `000.000.000-00`. Returns input if not 11 digits. */
export function formatCpf(cpf: string): string {
  const d = normalizeCpf(cpf)
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Masks a CPF for public display: `***.456.789-**`. */
export function maskCpf(cpf: string): string {
  const d = normalizeCpf(cpf)
  if (d.length !== 11) return "***.***.***-**"
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/**
 * Compares a registered CPF (may be null) against a typed one.
 * - registered null/empty  ⇒ true (nothing to check against)
 * - both present           ⇒ true iff normalized digits match
 */
export function cpfsMatch(registered: string | null, typed: string): boolean {
  const reg = registered ? normalizeCpf(registered) : ""
  if (!reg) return true
  return reg === normalizeCpf(typed)
}
