export interface ProfessionalLimitCheck {
  maxProfessionals: number | null
  currentCount: number
}

export interface LimitResult {
  allowed: boolean
  message?: string
}

export function checkProfessionalLimit(check: ProfessionalLimitCheck): LimitResult {
  const { maxProfessionals, currentCount } = check
  if (maxProfessionals === null || maxProfessionals === -1) {
    return { allowed: true }
  }
  if (currentCount >= maxProfessionals) {
    return {
      allowed: false,
      message: `Seu plano permite no maximo ${maxProfessionals} profissionais. Faca upgrade para adicionar mais.`,
    }
  }
  return { allowed: true }
}
