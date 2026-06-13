/**
 * Pure cadence/pause decisions for the scale-sends cron. No Prisma, no I/O —
 * the route assembles the input from queries and applies {@link decideSchedule}.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Window (in hours) before a CONSULTA in which a pre-session scale is sent. */
export const PRE_SESSION_WINDOW_HOURS = 36

export type ScheduleCadenceType = "ANTES_DE_SESSAO" | "A_CADA_N_SEMANAS"

export type SchedulePauseReason =
  | "SEM_AGENDAMENTOS_FUTUROS"
  | "SEM_CANAL_CONSENTIDO"
  | "PROFISSIONAL_INATIVO"

export interface ScheduleDecisionInput {
  cadenceType: ScheduleCadenceType
  intervalWeeks: number | null
  lastSentAt: Date | null
  now: Date
  /** Next CONSULTA (AGENDADO/CONFIRMADO) for the patient, or null. */
  nextConsultaAt: Date | null
  /** Whether a send already happened for the target appointment (dedup). */
  alreadySentForAppointment: boolean
  professionalIsActive: boolean
  hasConsentedChannel: boolean
  /** Discharge timestamp; null until the prontuário feature exists. */
  recordClosedAt: Date | null
}

export type ScheduleDecision =
  | { action: "SEND"; targetAppointment: boolean }
  | { action: "SKIP" }
  | { action: "PAUSE"; reason: SchedulePauseReason }

/** True when `now` is within `(prev, prev + 36h]` of the next consulta. */
export function isWithinPreSessionWindow(nextConsultaAt: Date, now: Date): boolean {
  const diffMs = nextConsultaAt.getTime() - now.getTime()
  return diffMs > 0 && diffMs <= PRE_SESSION_WINDOW_HOURS * 60 * 60 * 1000
}

/**
 * True when an "every N weeks" cadence is due: never sent, or the interval has
 * fully elapsed since the last send.
 */
export function isCadenceDue(
  lastSentAt: Date | null,
  intervalWeeks: number,
  now: Date
): boolean {
  if (lastSentAt === null) return true
  const elapsed = now.getTime() - lastSentAt.getTime()
  return elapsed >= intervalWeeks * WEEK_MS
}

/**
 * Decides what the cron should do for a single active schedule. Pause checks
 * take priority over sends:
 *  1. Inactive professional ⇒ PAUSE(PROFISSIONAL_INATIVO).
 *  2. No consented channel ⇒ PAUSE(SEM_CANAL_CONSENTIDO).
 *  3. No future CONSULTA *and* the record is closed ⇒ PAUSE(SEM_AGENDAMENTOS_FUTUROS).
 *     (Before prontuário exists, recordClosedAt is null, so this stays SKIP.)
 * Then cadence-specific send rules.
 */
export function decideSchedule(input: ScheduleDecisionInput): ScheduleDecision {
  if (!input.professionalIsActive) {
    return { action: "PAUSE", reason: "PROFISSIONAL_INATIVO" }
  }
  if (!input.hasConsentedChannel) {
    return { action: "PAUSE", reason: "SEM_CANAL_CONSENTIDO" }
  }

  const noFutureConsulta = input.nextConsultaAt === null
  if (noFutureConsulta && input.recordClosedAt !== null) {
    return { action: "PAUSE", reason: "SEM_AGENDAMENTOS_FUTUROS" }
  }

  if (input.cadenceType === "ANTES_DE_SESSAO") {
    if (input.nextConsultaAt === null) return { action: "SKIP" }
    if (input.alreadySentForAppointment) return { action: "SKIP" }
    if (!isWithinPreSessionWindow(input.nextConsultaAt, input.now)) {
      return { action: "SKIP" }
    }
    return { action: "SEND", targetAppointment: true }
  }

  // A_CADA_N_SEMANAS
  const weeks = input.intervalWeeks ?? 0
  if (weeks <= 0) return { action: "SKIP" }
  if (!isCadenceDue(input.lastSentAt, weeks, input.now)) return { action: "SKIP" }
  return { action: "SEND", targetAppointment: false }
}

/** Human-readable pt-BR description of a cadence. */
export function describeCadence(
  cadenceType: string,
  intervalWeeks: number | null
): string {
  if (cadenceType === "ANTES_DE_SESSAO") return "Antes de cada sessão"
  if (cadenceType === "A_CADA_N_SEMANAS" && intervalWeeks) {
    return intervalWeeks === 1
      ? "A cada 1 semana"
      : `A cada ${intervalWeeks} semanas`
  }
  return "Cadência indefinida"
}
