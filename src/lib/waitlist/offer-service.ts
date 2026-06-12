import { prisma } from "@/lib/prisma"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { createAndSendNotification, getPatientPhoneNumbers } from "@/lib/notifications"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { computeOfferExpiry } from "./expiry"
import { generateOfferToken, hashOfferToken, buildOfferUrl } from "./offer-tokens"
import type { OpenSlot } from "./types"

interface OfferPatient {
  id: string
  name: string
  email: string | null
  consentWhatsApp: boolean
  consentEmail: boolean
}

function offerBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

function localDate(d: Date, timezone: string): string {
  return d.toLocaleDateString("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function localTime(d: Date, timezone: string): string {
  return d.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })
}

function modalityLabel(modality: "ONLINE" | "PRESENCIAL" | null): string {
  if (modality === "ONLINE") return "Online"
  if (modality === "PRESENCIAL") return "Presencial"
  return "A combinar"
}

/**
 * Creates a WaitlistOffer for an entry, flips the entry to OFERTADA, sends the
 * notification on each consented channel, and audits. Returns the created
 * offer id, or null when the patient has no usable consent channel.
 */
export async function createAndSendOffer(input: {
  clinicId: string
  clinicName: string
  entryId: string
  slot: OpenSlot
  patient: OfferPatient
  professionalName: string
  now: Date
  holdHours: number
  timezone: string
  strategy: string
  userId?: string | null
}): Promise<string | null> {
  const {
    clinicId,
    clinicName,
    entryId,
    slot,
    patient,
    professionalName,
    now,
    holdHours,
    timezone,
    strategy,
    userId = null,
  } = input

  if (!patient.consentWhatsApp && !patient.consentEmail) return null

  const token = generateOfferToken()
  const expiresAt = computeOfferExpiry(now, holdHours, slot.scheduledAt)

  const offer = await prisma.waitlistOffer.create({
    data: {
      clinicId,
      entryId,
      professionalProfileId: slot.professionalProfileId,
      slotStart: slot.scheduledAt,
      slotEnd: slot.endAt,
      modality: slot.modality ?? undefined,
      tokenHash: hashOfferToken(token),
      status: "ENVIADA",
      expiresAt,
      sourceAppointmentId: slot.sourceAppointmentId,
    },
  })

  await prisma.waitlistEntry.update({
    where: { id: entryId },
    data: { status: "OFERTADA", lastOfferedAt: now },
  })

  await sendOfferNotifications({
    clinicId,
    clinicName,
    patient,
    professionalName,
    slot,
    token,
    expiresAt,
    timezone,
  })

  await prisma.auditLog.create({
    data: {
      clinicId,
      userId,
      action: "WAITLIST_OFFER_SENT",
      entityType: "WaitlistOffer",
      entityId: offer.id,
      newValues: {
        entryId,
        slotStart: slot.scheduledAt.toISOString(),
        strategy,
      },
    },
  })

  return offer.id
}

/** Sends the WAITLIST_OFFER notification on each consented channel. */
export async function sendOfferNotifications(input: {
  clinicId: string
  clinicName: string
  patient: OfferPatient
  professionalName: string
  slot: { scheduledAt: Date; endAt: Date; modality: "ONLINE" | "PRESENCIAL" | null }
  token: string
  expiresAt: Date
  timezone: string
}): Promise<void> {
  const { clinicId, clinicName, patient, professionalName, slot, token, expiresAt, timezone } = input
  const offerUrl = buildOfferUrl(offerBaseUrl(), token)

  const variables = {
    patientName: patient.name,
    professionalName,
    date: localDate(slot.scheduledAt, timezone),
    time: localTime(slot.scheduledAt, timezone),
    modality: modalityLabel(slot.modality),
    offerUrl,
    expiresAt: expiresAt.toLocaleString("pt-BR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    clinicName,
  }

  if (patient.consentWhatsApp) {
    const template = await getTemplate(clinicId, NotificationType.WAITLIST_OFFER, NotificationChannel.WHATSAPP)
    const content = renderTemplate(template.content, variables)
    const phones = await getPatientPhoneNumbers(patient.id, clinicId)
    for (const { phone } of phones) {
      await createAndSendNotification({
        clinicId,
        patientId: patient.id,
        type: NotificationType.WAITLIST_OFFER,
        channel: NotificationChannel.WHATSAPP,
        recipient: phone,
        content,
      })
    }
  }

  if (patient.consentEmail && patient.email) {
    const template = await getTemplate(clinicId, NotificationType.WAITLIST_OFFER, NotificationChannel.EMAIL)
    const content = renderTemplate(template.content, variables)
    const subject = template.subject
      ? renderTemplate(template.subject, variables)
      : `Horário disponível — ${variables.date} às ${variables.time}`
    await createAndSendNotification({
      clinicId,
      patientId: patient.id,
      type: NotificationType.WAITLIST_OFFER,
      channel: NotificationChannel.EMAIL,
      recipient: patient.email,
      subject,
      content,
    })
  }
}

/**
 * Sends the polite "slot already filled / still on the list" message after an
 * offer expires. Best-effort; consent-gated like all outbound messages.
 */
export async function sendExpiryNotification(input: {
  clinicId: string
  clinicName: string
  patient: OfferPatient
  slot: { scheduledAt: Date }
  timezone: string
}): Promise<void> {
  const { clinicId, clinicName, patient, slot, timezone } = input
  const variables = {
    patientName: patient.name,
    date: localDate(slot.scheduledAt, timezone),
    time: localTime(slot.scheduledAt, timezone),
    clinicName,
  }

  if (patient.consentWhatsApp) {
    const template = await getTemplate(clinicId, NotificationType.WAITLIST_OFFER_EXPIRED, NotificationChannel.WHATSAPP)
    const content = renderTemplate(template.content, variables)
    const phones = await getPatientPhoneNumbers(patient.id, clinicId)
    for (const { phone } of phones) {
      await createAndSendNotification({
        clinicId,
        patientId: patient.id,
        type: NotificationType.WAITLIST_OFFER_EXPIRED,
        channel: NotificationChannel.WHATSAPP,
        recipient: phone,
        content,
      })
    }
  }

  if (patient.consentEmail && patient.email) {
    const template = await getTemplate(clinicId, NotificationType.WAITLIST_OFFER_EXPIRED, NotificationChannel.EMAIL)
    const content = renderTemplate(template.content, variables)
    const subject = template.subject
      ? renderTemplate(template.subject, variables)
      : `Atualização sobre seu horário — ${clinicName}`
    await createAndSendNotification({
      clinicId,
      patientId: patient.id,
      type: NotificationType.WAITLIST_OFFER_EXPIRED,
      channel: NotificationChannel.EMAIL,
      recipient: patient.email,
      subject,
      content,
    })
  }
}
