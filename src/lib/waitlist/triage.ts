import { prisma } from "@/lib/prisma"
import { buildTriageTodoTitle, buildBatchTodoTitle } from "./slot-events"
import type { MatchCandidate, OpenSlot } from "./types"

function formatLocalDate(d: Date, timezone: string): string {
  return d.toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit" })
}

function formatLocalTime(d: Date, timezone: string): string {
  return d.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })
}

/** Date-only (midnight UTC) for a Todo's `day` (@db.Date) in the clinic timezone. */
function localDayDate(d: Date, timezone: string): Date {
  const iso = d.toLocaleDateString("en-CA", { timeZone: timezone })
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Builds the "top 3" notes block with names + phones (leads included). */
async function buildTriageNotes(clinicId: string, ranked: MatchCandidate[]): Promise<string> {
  const top = ranked.slice(0, 3)
  const patientIds = top.map((c) => c.entry.patientId).filter((id): id is string => id !== null)
  const patients = patientIds.length
    ? await prisma.patient.findMany({
        where: { id: { in: patientIds }, clinicId },
        select: { id: true, name: true, phone: true },
      })
    : []
  const byId = new Map(patients.map((p) => [p.id, p]))

  const leadEntryIds = top.filter((c) => c.entry.patientId === null).map((c) => c.entry.id)
  const leads = leadEntryIds.length
    ? await prisma.waitlistEntry.findMany({
        where: { id: { in: leadEntryIds }, clinicId, patientId: null },
        select: { id: true, leadName: true, leadPhone: true },
      })
    : []
  const leadById = new Map(leads.map((l) => [l.id, l]))

  return top
    .map((c) => {
      if (c.entry.patientId) {
        const p = byId.get(c.entry.patientId)
        return `• ${p?.name ?? "Paciente"} — ${p?.phone ?? "sem telefone"}`
      }
      const lead = leadById.get(c.entry.id)
      return `• ${lead?.leadName ?? "Lead"} (lead) — ${lead?.leadPhone ?? "sem telefone"}`
    })
    .join("\n")
}

/** Creates a deduped triage Todo for a single open slot. */
export async function createSingleTriageTodo(
  clinicId: string,
  slot: OpenSlot,
  ranked: MatchCandidate[],
  timezone: string
): Promise<void> {
  const title = buildTriageTodoTitle(
    formatLocalDate(slot.scheduledAt, timezone),
    formatLocalTime(slot.scheduledAt, timezone),
    ranked.length
  )
  const day = localDayDate(slot.scheduledAt, timezone)

  const existing = await prisma.todo.findFirst({
    where: {
      clinicId,
      professionalProfileId: slot.professionalProfileId,
      day,
      title,
      done: false,
    },
    select: { id: true },
  })
  if (existing) return

  await prisma.todo.create({
    data: {
      clinicId,
      professionalProfileId: slot.professionalProfileId,
      title,
      notes: await buildTriageNotes(clinicId, ranked),
      day,
      sourceAppointmentId: slot.sourceAppointmentId,
    },
  })
}

/** Creates a single deduped triage Todo summarizing a batch of open slots. */
export async function createBatchTriageTodo(
  clinicId: string,
  slots: OpenSlot[],
  timezone: string
): Promise<void> {
  const sorted = [...slots].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  const title = buildBatchTodoTitle(
    slots.length,
    formatLocalDate(sorted[0].scheduledAt, timezone),
    formatLocalDate(sorted[sorted.length - 1].scheduledAt, timezone)
  )
  const profId = sorted[0].professionalProfileId
  const day = localDayDate(sorted[0].scheduledAt, timezone)

  const existing = await prisma.todo.findFirst({
    where: { clinicId, professionalProfileId: profId, day, title, done: false },
    select: { id: true },
  })
  if (existing) return

  await prisma.todo.create({
    data: {
      clinicId,
      professionalProfileId: profId,
      title,
      notes: "Vários horários abriram nesta operação. Veja a lista de espera para ofertar.",
      day,
    },
  })
}
