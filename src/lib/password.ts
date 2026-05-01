import bcrypt from "bcrypt"

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export interface PasswordStrengthResult {
  ok: boolean
  reason?: string
}

/**
 * Minimum password strength: 12+ chars, 3 of 4 character classes
 * (lowercase, uppercase, digit, symbol). Length + class diversity is enough
 * defense at our scale — no hardcoded deny-list (rots fast, noisy in git).
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < 12) {
    return { ok: false, reason: "Senha deve ter pelo menos 12 caracteres" }
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length
  if (classes < 3) {
    return {
      ok: false,
      reason: "Senha deve ter pelo menos 3 de 4 tipos: minuscula, maiuscula, numero, simbolo",
    }
  }
  return { ok: true }
}
