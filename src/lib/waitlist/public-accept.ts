import { prisma } from "@/lib/prisma"
import { checkConflict } from "@/lib/appointments"
import { hashOfferToken } from "./offer-tokens"
import { isOfferExpired } from "./expiry"

export type AcceptResult =
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "conflict" }
  | {
      kind: "ok"
      appointmentId: string
      clinicId: string
      entryId: string
      patientId: string
      slotStart: Date
      clinicName: string
      timezone: string
      patientName: string
      siblingPatients: SiblingPatient[]
    }

export interface SiblingPatient {
  id: string
  name: string
  email: string | null
  consentWhatsApp: boolean
  consentEmail: boolean
}

/**
 * Accepts a waitlist offer transactionally:
 *  - revalidates the offer is still ENVIADA and unexpired,
 *  - re-checks the slot is free with a row lock,
 *  - creates the Appointment (CONSULTA AGENDADO, price = sessionFee),
 *  - marks the offer ACEITA and the entry CONVERTIDA,
 *  - expires sibling ENVIADA offers for the same slot.
 *
 * Notifications and audit are the caller's responsibility (post-transaction).
 */
export async function acceptOfferByToken(token: string, now: Date): Promise<AcceptResult> {
  const tokenHash = hashOfferToken(token)

  const offer = await prisma.waitlistOffer.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      clinicId: true,
      entryId: true,
      professionalProfileId: true,
      slotStart: true,
      slotEnd: true,
      modality: true,
      status: true,
      expiresAt: true,
      sourceAppointmentId: true,
      entry: { select: { id: true, patientId: true, status: true } },
    },
  })

  if (!offer || !offer.entry.patientId) return { kind: "not_found" }
  if (isOfferExpired(offer, now)) return { kind: "expired" }
  if (offer.entry.status !== "OFERTADA") return { kind: "expired" }

  const patientId = offer.entry.patientId

  try {
    const appointmentId = await prisma.$transaction(async (tx) => {
      // Re-validate the offer state under the transaction.
      const fresh = await tx.waitlistOffer.findUnique({
        where: { id: offer.id },
        select: { status: true, expiresAt: true },
      })
      if (!fresh || isOfferExpired(fresh, now)) {
        throw new ExpiredError()
      }

      const conflict = await checkConflict(
        {
          professionalProfileId: offer.professionalProfileId,
          scheduledAt: offer.slotStart,
          endAt: offer.slotEnd,
        },
        tx
      )
      if (conflict.hasConflict) throw new ConflictError()

      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { sessionFee: true },
      })

      const appointment = await tx.appointment.create({
        data: {
          clinicId: offer.clinicId,
          professionalProfileId: offer.professionalProfileId,
          patientId,
          type: "CONSULTA",
          status: "AGENDADO",
          blocksTime: true,
          scheduledAt: offer.slotStart,
          endAt: offer.slotEnd,
          modality: offer.modality ?? undefined,
          price: patient?.sessionFee ?? undefined,
        },
        select: { id: true },
      })

      await tx.waitlistOffer.update({
        where: { id: offer.id },
        data: { status: "ACEITA", respondedAt: now, appointmentId: appointment.id },
      })

      await tx.waitlistEntry.update({
        where: { id: offer.entryId },
        data: { status: "CONVERTIDA", convertedAppointmentId: appointment.id },
      })

      // Expire sibling open offers for the same slot.
      await tx.waitlistOffer.updateMany({
        where: {
          clinicId: offer.clinicId,
          slotStart: offer.slotStart,
          professionalProfileId: offer.professionalProfileId,
          status: "ENVIADA",
          id: { not: offer.id },
        },
        data: { status: "EXPIRADA", respondedAt: now },
      })

      return appointment.id
    })

    // Gather sibling patients (their offers were just expired) for polite notices.
    const siblings = await collectSiblingPatients(offer.clinicId, offer.slotStart, offer.professionalProfileId, offer.id)

    const [clinic, patient] = await Promise.all([
      prisma.clinic.findUnique({
        where: { id: offer.clinicId },
        select: { name: true, timezone: true },
      }),
      prisma.patient.findUnique({ where: { id: patientId }, select: { name: true } }),
    ])

    return {
      kind: "ok",
      appointmentId,
      clinicId: offer.clinicId,
      entryId: offer.entryId,
      patientId,
      slotStart: offer.slotStart,
      clinicName: clinic?.name ?? "Clínica",
      timezone: clinic?.timezone || "America/Sao_Paulo",
      patientName: patient?.name ?? "",
      siblingPatients: siblings,
    }
  } catch (err) {
    if (err instanceof ConflictError) return { kind: "conflict" }
    if (err instanceof ExpiredError) return { kind: "expired" }
    throw err
  }
}

async function collectSiblingPatients(
  clinicId: string,
  slotStart: Date,
  professionalProfileId: string,
  acceptedOfferId: string
): Promise<SiblingPatient[]> {
  // Reset sibling entries back to ATIVA so they remain on the list.
  const siblings = await prisma.waitlistOffer.findMany({
    where: {
      clinicId,
      slotStart,
      professionalProfileId,
      status: "EXPIRADA",
      id: { not: acceptedOfferId },
    },
    select: {
      entryId: true,
      entry: {
        select: {
          status: true,
          patient: {
            select: { id: true, name: true, email: true, consentWhatsApp: true, consentEmail: true },
          },
        },
      },
    },
  })

  const result: SiblingPatient[] = []
  for (const s of siblings) {
    if (s.entry.status === "OFERTADA") {
      await prisma.waitlistEntry.update({
        where: { id: s.entryId },
        data: { status: "ATIVA" },
      })
    }
    if (s.entry.patient) result.push(s.entry.patient)
  }
  return result
}

class ConflictError extends Error {}
class ExpiredError extends Error {}
