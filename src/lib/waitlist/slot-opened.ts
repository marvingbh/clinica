import { prisma } from "@/lib/prisma"
import { parsePreferences } from "./preferences"
import { resolveWaitlistSettings } from "./settings"
import { toLocalSlot, rankCandidates } from "./matching"
import { decideSlotTrigger } from "./slot-events"
import { createSingleTriageTodo, createBatchTriageTodo } from "./triage"
import { createAndSendOffer } from "./offer-service"
import type { MatchCandidate, MatchableEntry, OpenSlot } from "./types"

export type SlotOpenTrigger =
  | "STAFF_CANCEL"
  | "STAFF_SERIES_CANCEL"
  | "PUBLIC_CANCEL"
  | "BULK_CANCEL"
  | "STATUS_CANCEL"
  | "APPOINTMENT_DELETED"
  | "APPOINTMENT_MOVED"
  | "RECURRENCE_SKIP"

const BROADCAST_CAP = 10

/**
 * Orchestrates the waitlist response to one or more slots opening up.
 *
 * - Loads clinic settings + active entries (active patients) once.
 * - batchSize > 1 → a single triage Todo, never auto-offer.
 * - Single slot: {@link decideSlotTrigger} → SKIP / TRIAGE_ONLY / AUTO.
 *
 * Always call from a try/catch in the originating adapter so a failure here
 * never breaks the cancellation that triggered it.
 */
export async function handleSlotsOpened(input: {
  clinicId: string
  slots: OpenSlot[]
  trigger: SlotOpenTrigger
}): Promise<void> {
  const { clinicId, slots } = input
  if (slots.length === 0) return

  const now = new Date()

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      timezone: true,
      waitlistSettings: true,
      appointmentNotificationsEnabled: true,
    },
  })
  if (!clinic) return

  const settings = resolveWaitlistSettings(clinic.waitlistSettings)
  const timezone = clinic.timezone || "America/Sao_Paulo"

  const entryRows = await prisma.waitlistEntry.findMany({
    where: {
      clinicId,
      status: "ATIVA",
      OR: [{ patientId: null }, { patient: { isActive: true } }],
    },
    select: {
      id: true,
      patientId: true,
      professionalProfileId: true,
      preferences: true,
      priority: true,
      createdAt: true,
    },
  })
  if (entryRows.length === 0) return

  const entries: MatchableEntry[] = entryRows.map((e) => ({
    id: e.id,
    patientId: e.patientId,
    professionalProfileId: e.professionalProfileId,
    preferences: parsePreferences(e.preferences),
    priority: e.priority,
    createdAt: e.createdAt,
  }))

  // Batch operation collapses into one triage Todo.
  if (slots.length > 1) {
    await createBatchTriageTodo(clinicId, slots, timezone)
    return
  }

  const slot = slots[0]
  const decision = decideSlotTrigger({
    type: "CONSULTA",
    blocksTime: true,
    scheduledAt: slot.scheduledAt,
    now,
    mode: settings.mode,
    minNoticeHours: settings.minNoticeHours,
    notificationsEnabled: clinic.appointmentNotificationsEnabled,
    batchSize: 1,
  })
  if (decision === "SKIP") return

  const sameDayPatientIds = await getSameDayPatientIds(clinicId, slot, timezone)
  const ranked = rankCandidates({
    slot,
    local: toLocalSlot(slot, timezone),
    entries,
    sameDayPatientIds,
  })
  if (ranked.length === 0) return

  if (decision === "TRIAGE_ONLY") {
    await createSingleTriageTodo(clinicId, slot, ranked, timezone)
    return
  }

  await runAutomaticOffers(clinic, settings, slot, ranked, now, timezone)
}

async function getSameDayPatientIds(
  clinicId: string,
  slot: OpenSlot,
  timezone: string
): Promise<Set<string>> {
  const dayISO = slot.scheduledAt.toLocaleDateString("en-CA", { timeZone: timezone })
  const dayStart = new Date(`${dayISO}T00:00:00.000Z`)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const rows = await prisma.appointment.findMany({
    where: {
      clinicId,
      patientId: { not: null },
      scheduledAt: { gte: dayStart, lt: dayEnd },
      status: { in: ["AGENDADO", "CONFIRMADO", "FINALIZADO"] },
    },
    select: { patientId: true },
  })
  return new Set(rows.map((r) => r.patientId).filter((id): id is string => id !== null))
}

async function runAutomaticOffers(
  clinic: { id: string; name: string },
  settings: ReturnType<typeof resolveWaitlistSettings>,
  slot: OpenSlot,
  ranked: MatchCandidate[],
  now: Date,
  timezone: string
): Promise<void> {
  // Only entries with a patient (LGPD consent verifiable) auto-offer; leads are
  // triage-only in V1.
  const withPatient = ranked.filter((c) => c.entry.patientId !== null)
  const targets =
    settings.strategy === "BROADCAST" ? withPatient.slice(0, BROADCAST_CAP) : withPatient.slice(0, 1)
  if (targets.length === 0) return

  const professional = await prisma.professionalProfile.findUnique({
    where: { id: slot.professionalProfileId },
    select: { user: { select: { name: true } } },
  })
  const professionalName = professional?.user.name ?? "profissional"

  for (const candidate of targets) {
    const patientId = candidate.entry.patientId
    if (!patientId) continue
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: clinic.id },
      select: { id: true, name: true, email: true, consentWhatsApp: true, consentEmail: true },
    })
    if (!patient) continue

    await createAndSendOffer({
      clinicId: clinic.id,
      clinicName: clinic.name,
      entryId: candidate.entry.id,
      slot,
      patient,
      professionalName,
      now,
      holdHours: settings.holdHours,
      timezone,
      strategy: settings.strategy,
    })
  }
}
