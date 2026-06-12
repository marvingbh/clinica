import { prisma } from "@/lib/prisma"
import { checkConflict } from "@/lib/appointments"
import { resolveWaitlistSettings } from "./settings"
import { parsePreferences } from "./preferences"
import { toLocalSlot, rankCandidates } from "./matching"
import { nextSequentialCandidate } from "./expiry"
import { createAndSendOffer, sendExpiryNotification } from "./offer-service"
import type { MatchableEntry, OpenSlot } from "./types"

export interface CronResults {
  offersExpired: number
  chainsAdvanced: number
  clinicsProcessed: number
  errors: string[]
}

/**
 * Cron tick:
 *  1. Mark every ENVIADA offer with expiresAt <= now as EXPIRADA; return its
 *     entry to ATIVA and send the polite notice.
 *  2. For SEQUENCIAL clinics, advance the chain: offer the next candidate when
 *     the slot is still free.
 */
export async function runWaitlistCron(now: Date): Promise<CronResults> {
  const results: CronResults = {
    offersExpired: 0,
    chainsAdvanced: 0,
    clinicsProcessed: 0,
    errors: [],
  }

  // 1. Expire due offers.
  const due = await prisma.waitlistOffer.findMany({
    where: { status: "ENVIADA", expiresAt: { lte: now } },
    select: {
      id: true,
      clinicId: true,
      entryId: true,
      professionalProfileId: true,
      slotStart: true,
      slotEnd: true,
      modality: true,
      sourceAppointmentId: true,
      entry: {
        select: {
          status: true,
          patient: {
            select: { id: true, name: true, email: true, consentWhatsApp: true, consentEmail: true },
          },
        },
      },
      clinic: { select: { name: true, timezone: true } },
    },
  })

  for (const offer of due) {
    try {
      await prisma.$transaction([
        prisma.waitlistOffer.update({
          where: { id: offer.id },
          data: { status: "EXPIRADA", respondedAt: now },
        }),
        prisma.waitlistEntry.updateMany({
          where: { id: offer.entryId, status: "OFERTADA" },
          data: { status: "ATIVA" },
        }),
      ])

      await prisma.auditLog.create({
        data: {
          clinicId: offer.clinicId,
          userId: null,
          action: "WAITLIST_OFFER_EXPIRED",
          entityType: "WaitlistOffer",
          entityId: offer.id,
          newValues: { entryId: offer.entryId },
        },
      })

      // Polite notice only when the slot was actually taken (no longer free).
      const conflict = await checkConflict({
        professionalProfileId: offer.professionalProfileId,
        scheduledAt: offer.slotStart,
        endAt: offer.slotEnd,
      })
      if (conflict.hasConflict && offer.entry.patient) {
        await sendExpiryNotification({
          clinicId: offer.clinicId,
          clinicName: offer.clinic.name,
          patient: offer.entry.patient,
          slot: { scheduledAt: offer.slotStart },
          timezone: offer.clinic.timezone || "America/Sao_Paulo",
        })
      }
      results.offersExpired++
    } catch (err) {
      results.errors.push(`expire offer ${offer.id}: ${String(err)}`)
    }
  }

  // 2. Advance sequential chains for clinics in automatic mode.
  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      timezone: true,
      waitlistSettings: true,
      appointmentNotificationsEnabled: true,
    },
  })

  for (const clinic of clinics) {
    const settings = resolveWaitlistSettings(clinic.waitlistSettings)
    if (
      settings.mode !== "OFERTA_AUTOMATICA" ||
      settings.strategy !== "SEQUENCIAL" ||
      !clinic.appointmentNotificationsEnabled
    ) {
      continue
    }
    results.clinicsProcessed++
    try {
      const advanced = await advanceSequentialChains(clinic, settings, now)
      results.chainsAdvanced += advanced
    } catch (err) {
      results.errors.push(`advance clinic ${clinic.id}: ${String(err)}`)
    }
  }

  return results
}

/**
 * Finds slots that recently expired/declined (no open offer, slot still free)
 * and offers the next sequential candidate.
 */
async function advanceSequentialChains(
  clinic: { id: string; name: string; timezone: string },
  settings: ReturnType<typeof resolveWaitlistSettings>,
  now: Date
): Promise<number> {
  const timezone = clinic.timezone || "America/Sao_Paulo"

  // Recently-resolved (EXPIRADA/RECUSADA) offers for future slots with no open
  // sibling — these are chains that may need advancing.
  const resolved = await prisma.waitlistOffer.findMany({
    where: {
      clinicId: clinic.id,
      status: { in: ["EXPIRADA", "RECUSADA"] },
      slotStart: { gt: now },
      respondedAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) }, // within last hour
    },
    select: {
      professionalProfileId: true,
      slotStart: true,
      slotEnd: true,
      modality: true,
      sourceAppointmentId: true,
    },
    distinct: ["professionalProfileId", "slotStart"],
  })
  if (resolved.length === 0) return 0

  const activeEntries = await prisma.waitlistEntry.findMany({
    where: {
      clinicId: clinic.id,
      status: "ATIVA",
      patientId: { not: null },
      patient: { isActive: true },
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
  if (activeEntries.length === 0) return 0

  const entries: MatchableEntry[] = activeEntries.map((e) => ({
    id: e.id,
    patientId: e.patientId,
    professionalProfileId: e.professionalProfileId,
    preferences: parsePreferences(e.preferences),
    priority: e.priority,
    createdAt: e.createdAt,
  }))

  let advanced = 0
  for (const slotRow of resolved) {
    // Skip if there is already an open offer for this slot.
    const openOffer = await prisma.waitlistOffer.findFirst({
      where: {
        clinicId: clinic.id,
        slotStart: slotRow.slotStart,
        professionalProfileId: slotRow.professionalProfileId,
        status: "ENVIADA",
      },
      select: { id: true },
    })
    if (openOffer) continue

    // Slot must still be free.
    const conflict = await checkConflict({
      professionalProfileId: slotRow.professionalProfileId,
      scheduledAt: slotRow.slotStart,
      endAt: slotRow.slotEnd,
    })
    if (conflict.hasConflict) continue

    const slot: OpenSlot = {
      professionalProfileId: slotRow.professionalProfileId,
      scheduledAt: slotRow.slotStart,
      endAt: slotRow.slotEnd,
      modality: slotRow.modality,
      sourceAppointmentId: slotRow.sourceAppointmentId,
    }

    // Entries already offered this slot (any status) should not be re-offered.
    const offered = await prisma.waitlistOffer.findMany({
      where: {
        clinicId: clinic.id,
        slotStart: slotRow.slotStart,
        professionalProfileId: slotRow.professionalProfileId,
      },
      select: { entryId: true },
    })
    const alreadyOffered = new Set(offered.map((o) => o.entryId))

    const ranked = rankCandidates({
      slot,
      local: toLocalSlot(slot, timezone),
      entries,
      sameDayPatientIds: new Set(),
    })
    const next = nextSequentialCandidate(ranked, alreadyOffered)
    if (!next || !next.entry.patientId) continue

    const patient = await prisma.patient.findFirst({
      where: { id: next.entry.patientId, clinicId: clinic.id },
      select: { id: true, name: true, email: true, consentWhatsApp: true, consentEmail: true },
    })
    if (!patient) continue

    const professional = await prisma.professionalProfile.findUnique({
      where: { id: slot.professionalProfileId },
      select: { user: { select: { name: true } } },
    })

    const offerId = await createAndSendOffer({
      clinicId: clinic.id,
      clinicName: clinic.name,
      entryId: next.entry.id,
      slot,
      patient,
      professionalName: professional?.user.name ?? "profissional",
      now,
      holdHours: settings.holdHours,
      timezone,
      strategy: "SEQUENCIAL",
    })
    if (offerId) advanced++
  }

  return advanced
}
