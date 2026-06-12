/**
 * Monthly AI credit rules (pure). One successful generation = one credit
 * (RN1). Credits are per clinic per UTC calendar month, no rollover (RN2/RN3).
 */

export interface AiCreditCheck {
  /** Plan.aiMonthlyCredits: 0 = no AI; -1 = unlimited; N > 0 = N/month per clinic. */
  planCredits: number
  /** Successful generations already consumed this month. */
  usedThisMonth: number
}

export interface AiCreditResult {
  allowed: boolean
  /** null = unlimited. */
  remaining: number | null
  message?: string
}

const NO_PLAN_MESSAGE =
  "Seu plano não inclui o assistente de IA. Faça upgrade do plano para gerar rascunhos com IA."

export function limitReachedMessage(planCredits: number): string {
  return `Você atingiu o limite de ${planCredits} gerações deste mês. Faça upgrade do plano para continuar gerando rascunhos com IA.`
}

export function checkAiCredits({ planCredits, usedThisMonth }: AiCreditCheck): AiCreditResult {
  if (planCredits === 0) {
    return { allowed: false, remaining: 0, message: NO_PLAN_MESSAGE }
  }
  if (planCredits < 0) {
    // Unlimited.
    return { allowed: true, remaining: null }
  }
  if (usedThisMonth >= planCredits) {
    return { allowed: false, remaining: 0, message: limitReachedMessage(planCredits) }
  }
  return { allowed: true, remaining: planCredits - usedThisMonth }
}

/** UTC calendar-month range [start, end) containing `now`. */
export function getUtcMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { start, end }
}

/**
 * Parse a `YYYY-MM` month parameter into a UTC range. Falls back to the current
 * UTC month for missing or malformed input.
 */
export function parseMonthParam(month: string | null, now: Date): { start: Date; end: Date } {
  const match = month?.match(/^(\d{4})-(\d{2})$/)
  if (!match) return getUtcMonthRange(now)
  const year = Number(match[1])
  const m = Number(match[2])
  if (m < 1 || m > 12) return getUtcMonthRange(now)
  const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, m, 1, 0, 0, 0, 0))
  return { start, end }
}
