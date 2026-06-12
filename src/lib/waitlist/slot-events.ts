import type { WaitlistSettings } from "./settings"

export type SlotTriggerDecision = "AUTO" | "TRIAGE_ONLY" | "SKIP"

/**
 * Decides what to do when an appointment slot opens up.
 *
 * - SKIP: not a faturable, time-blocking CONSULTA, or the slot is in the past.
 * - TRIAGE_ONLY: eligible slot but automatic offers are not appropriate
 *   (manual mode, notifications gate off, less than minNoticeHours notice, or
 *   part of a batch of >1 slots).
 * - AUTO: send automatic offers.
 */
export function decideSlotTrigger(input: {
  type: string
  blocksTime: boolean
  scheduledAt: Date
  now: Date
  mode: WaitlistSettings["mode"]
  minNoticeHours: number
  notificationsEnabled: boolean
  batchSize: number
}): SlotTriggerDecision {
  const {
    type,
    blocksTime,
    scheduledAt,
    now,
    mode,
    minNoticeHours,
    notificationsEnabled,
    batchSize,
  } = input

  // Only time-blocking CONSULTA slots are faturable sessions worth recovering.
  if (type !== "CONSULTA" || !blocksTime) return "SKIP"

  // The slot must be in the future.
  if (scheduledAt.getTime() <= now.getTime()) return "SKIP"

  // Batch operations (series/bulk) never auto-offer — only a single triage Todo.
  if (batchSize > 1) return "TRIAGE_ONLY"

  // Automatic offers require the opt-in mode AND the outbound notifications gate.
  if (mode !== "OFERTA_AUTOMATICA" || !notificationsEnabled) return "TRIAGE_ONLY"

  // Too little notice to safely run an offer cycle.
  const noticeMs = minNoticeHours * 60 * 60 * 1000
  if (scheduledAt.getTime() - now.getTime() < noticeMs) return "TRIAGE_ONLY"

  return "AUTO"
}

/** Title for a single open-slot triage Todo, e.g. "Horário vago 17/06 14:00 — 3 na lista de espera". */
export function buildTriageTodoTitle(
  slotLocalDate: string,
  slotLocalTime: string,
  matchCount: number
): string {
  return `Horário vago ${slotLocalDate} ${slotLocalTime} — ${matchCount} na lista de espera`
}

/** Title for a batched triage Todo, e.g. "5 horários vagos entre 17/06 e 24/06 — ver lista de espera". */
export function buildBatchTodoTitle(
  count: number,
  firstDate: string,
  lastDate: string
): string {
  return `${count} horários vagos entre ${firstDate} e ${lastDate} — ver lista de espera`
}
