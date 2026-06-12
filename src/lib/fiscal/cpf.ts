// CPF validation + formatting. Mirrors the CNPJ logic in
// src/lib/nfse/validation.ts (check digits, reject repeated digits).

function calcCheckDigit(digits: number[], factorStart: number): number {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (factorStart - i)
  }
  const remainder = (sum * 10) % 11
  return remainder === 10 ? 0 : remainder
}

/** Validates a CPF string (with or without mask). */
export function validateCpf(cpf: string): boolean {
  const stripped = cpf.replace(/\D/g, "")

  if (stripped.length !== 11) return false

  // Reject all-same-digit CPFs (e.g. 00000000000, 11111111111)
  if (/^(\d)\1{10}$/.test(stripped)) return false

  const digits = stripped.split("").map(Number)

  const firstCheck = calcCheckDigit(digits.slice(0, 9), 10)
  if (digits[9] !== firstCheck) return false

  const secondCheck = calcCheckDigit(digits.slice(0, 10), 11)
  if (digits[10] !== secondCheck) return false

  return true
}

/** Strips a CPF to digits only (empty string if no digits). */
export function stripCpf(cpf: string): string {
  return cpf.replace(/\D/g, "")
}

/** Formats an 11-digit CPF as 000.000.000-00. Returns the input if invalid length. */
export function formatCpf(cpf: string): string {
  const s = stripCpf(cpf)
  if (s.length !== 11) return cpf
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9, 11)}`
}
