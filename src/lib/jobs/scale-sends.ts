/**
 * Pure helpers for the scale-sends cron. The route does the Prisma queries and
 * passes the raw values here; cadence/pause decisions live in
 * `src/lib/scales/schedule.ts`.
 */
import { hasPatientConsent, type PatientConsent } from "./send-reminders"
import type { ScheduleDecisionInput } from "@/lib/scales/schedule"

export interface ScheduleRow {
  cadenceType: string
  intervalWeeks: number | null
  lastSentAt: Date | null
}

export interface ScheduleContext {
  now: Date
  nextConsultaAt: Date | null
  alreadySentForAppointment: boolean
  professionalIsActive: boolean
  patient: PatientConsent
  recordClosedAt: Date | null
}

/**
 * Assembles a {@link ScheduleDecisionInput} from a schedule row plus the
 * surrounding context resolved by the route. `hasConsentedChannel` is true when
 * the patient has consented to at least one channel.
 */
export function buildScheduleDecisionInput(
  row: ScheduleRow,
  ctx: ScheduleContext
): ScheduleDecisionInput {
  const consent = hasPatientConsent(ctx.patient)
  return {
    cadenceType: row.cadenceType as ScheduleDecisionInput["cadenceType"],
    intervalWeeks: row.intervalWeeks,
    lastSentAt: row.lastSentAt,
    now: ctx.now,
    nextConsultaAt: ctx.nextConsultaAt,
    alreadySentForAppointment: ctx.alreadySentForAppointment,
    professionalIsActive: ctx.professionalIsActive,
    hasConsentedChannel: consent.whatsapp || consent.email,
    recordClosedAt: ctx.recordClosedAt,
  }
}

/**
 * Picks the delivery channel for an automatic send, preferring EMAIL (the only
 * real-delivery channel today) when both are consented. Returns null when no
 * channel is consented.
 */
export function pickSendChannel(patient: PatientConsent): "EMAIL" | "WHATSAPP" | null {
  const consent = hasPatientConsent(patient)
  if (consent.email) return "EMAIL"
  if (consent.whatsapp) return "WHATSAPP"
  return null
}
