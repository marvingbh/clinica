/**
 * Restore biweekly recurrences that were finalized by mistake.
 *
 * Background: On 2026-05-04, four sequential RECURRENCE_FINALIZED audit events
 * ended both biweekly partners on Elena Sabino's Friday 13:15 and 14:00 slots.
 * Only Alice Ajeje was meant to be ended (she left therapy). Alice Rodrigues
 * Saad (13:15 partner) and Ana Vitória Ajeje Manhaes (14:00 partner) need to
 * be un-finalized and have their deleted future appointments regenerated.
 *
 * Idempotent: running twice with --apply will not double-create appointments
 * (it only creates dates that don't already exist for the recurrence).
 *
 * Usage (against the database currently in DATABASE_URL):
 *   npx tsx scripts/restore-finalized-recurrences.ts             # dry run
 *   npx tsx scripts/restore-finalized-recurrences.ts --apply     # write
 *
 * To run against production explicitly:
 *   DATABASE_URL="$DATABASE_URL_PROD" npx tsx scripts/restore-finalized-recurrences.ts --apply
 */

import { PrismaClient, RecurrenceEndType, AppointmentStatus } from "@prisma/client"
import { calculateNextWindowDates } from "../src/lib/appointments"
import { filterConflicts, buildAppointmentData } from "../src/lib/jobs/extend-recurrences"

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes("--apply")

// Recurrences mistakenly finalized on 2026-05-04 alongside Alice Ajeje's two
// recurrences. These two are the surviving biweekly partners that should
// continue indefinitely.
const RECURRENCE_IDS = [
  "cmniu1rlz0001l2047pb0c197", // Alice Rodrigues Saad — Fri 13:15
  "cmlph81mt00dal404mxm121l7", // Ana Vitória Ajeje Manhaes — Fri 14:00
]

const EXTENSION_MONTHS = 6

async function restoreRecurrence(recurrenceId: string) {
  const recurrence = await prisma.appointmentRecurrence.findUnique({
    where: { id: recurrenceId },
    include: {
      patient: { select: { name: true } },
      professionalProfile: { select: { bufferBetweenSlots: true, user: { select: { name: true } } } },
    },
  })

  if (!recurrence) {
    console.log(`✗ Recurrence ${recurrenceId} not found, skipping`)
    return
  }

  const label = `${recurrence.patient?.name ?? "(no patient)"} · ${recurrence.startTime} ${recurrence.recurrenceType}`
  console.log(`\n--- ${label} ---`)
  console.log(`  Current: endDate=${recurrence.endDate?.toISOString().slice(0, 10) ?? "null"} endType=${recurrence.recurrenceEndType} isActive=${recurrence.isActive} lastGenerated=${recurrence.lastGeneratedDate?.toISOString().slice(0, 10) ?? "null"}`)

  // Anchor for regeneration: use the latest existing appointment for this
  // recurrence so calculateNextWindowDates moves forward without overlapping
  // anything that's still on the books (including past cancelled holidays).
  const latestExisting = await prisma.appointment.findFirst({
    where: { recurrenceId },
    orderBy: { scheduledAt: "desc" },
    select: { scheduledAt: true, status: true },
  })

  const anchorDate = latestExisting?.scheduledAt ?? recurrence.startDate
  console.log(`  Anchor (lastGeneratedDate): ${anchorDate.toISOString().slice(0, 10)}${latestExisting ? ` (${latestExisting.status})` : " (no existing apts; using startDate)"}`)

  // Generate next window from the anchor.
  const candidateDates = calculateNextWindowDates(
    anchorDate,
    recurrence.startTime,
    recurrence.duration,
    recurrence.recurrenceType,
    recurrence.dayOfWeek,
    EXTENSION_MONTHS,
  )

  // Drop any dates that fall on this recurrence's exceptions list.
  const withoutExceptions = candidateDates.filter((d) => !recurrence.exceptions.includes(d.date))

  // Avoid creating duplicates of any appointment already in the DB for this
  // recurrence, regardless of status — running twice should be safe.
  const existingTimes = new Set(
    (
      await prisma.appointment.findMany({
        where: { recurrenceId },
        select: { scheduledAt: true },
      })
    ).map((a) => a.scheduledAt.getTime()),
  )
  const newDates = withoutExceptions.filter((d) => !existingTimes.has(d.scheduledAt.getTime()))

  // Conflict-check against active appointments on the same professional.
  const horizon = newDates.length > 0 ? newDates[newDates.length - 1].endAt : anchorDate
  const conflicts = await prisma.appointment.findMany({
    where: {
      professionalProfileId: recurrence.professionalProfileId,
      scheduledAt: { gte: anchorDate, lte: horizon },
      status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO] },
      recurrenceId: { not: recurrenceId },
    },
    select: { scheduledAt: true, endAt: true },
  })
  const buffer = recurrence.professionalProfile.bufferBetweenSlots || 0
  const safeDates = filterConflicts(newDates, conflicts, buffer)
  const skippedConflicts = newDates.length - safeDates.length

  console.log(`  Will generate: ${safeDates.length} appointments` + (skippedConflicts ? ` (skipped ${skippedConflicts} conflicting)` : ""))
  if (safeDates.length > 0) {
    console.log(`    First: ${safeDates[0].scheduledAt.toISOString()}`)
    console.log(`    Last:  ${safeDates[safeDates.length - 1].scheduledAt.toISOString()}`)
  }

  if (DRY_RUN) return

  await prisma.$transaction(async (tx) => {
    await tx.appointmentRecurrence.update({
      where: { id: recurrenceId },
      data: {
        endDate: null,
        recurrenceEndType: RecurrenceEndType.INDEFINITE,
        isActive: true,
        lastGeneratedDate: safeDates.length > 0 ? new Date(safeDates[safeDates.length - 1].date) : anchorDate,
      },
    })

    if (safeDates.length > 0) {
      const data = buildAppointmentData(safeDates, {
        id: recurrence.id,
        clinicId: recurrence.clinicId,
        professionalProfileId: recurrence.professionalProfileId,
        patientId: recurrence.patientId,
        modality: recurrence.modality ?? "PRESENCIAL",
      })
      await tx.appointment.createMany({ data })
    }
  })

  console.log(`  ✓ Restored`)
}

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN (pass --apply to write)\n" : "✏️  APPLYING CHANGES\n")
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/:[^@/]+@/, ":***@") ?? "(unset)"}\n`)

  for (const id of RECURRENCE_IDS) {
    await restoreRecurrence(id)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
