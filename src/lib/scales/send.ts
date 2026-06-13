import { prisma } from "@/lib/prisma"
import {
  NotificationChannel,
  NotificationType,
  type ScaleAdministration,
} from "@prisma/client"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { getScaleDefinition } from "./definitions"
import { generateScaleToken, buildScaleUrl, computeExpiry, hashScaleToken } from "./tokens"

export type ScaleChannel = "WHATSAPP" | "EMAIL"

export interface SendScaleParams {
  clinicId: string
  patientId: string
  professionalProfileId: string
  scaleCode: string
  channel: ScaleChannel
  baseUrl: string
  /** Optional: schedule that originated this send (cron). */
  scheduleId?: string | null
  /** Optional: target CONSULTA (pre-session cadence) for dedup. */
  appointmentId?: string | null
}

export interface SendScaleResult {
  administration: ScaleAdministration
  link: string
}

/**
 * Creates a new scale administration and dispatches the SCALE_INVITE link.
 *  1. Supersede any active (ENVIADA) administration of the same scale for the
 *     patient → EXPIRADA, pointing supersededById at the new one.
 *  2. Mint a random token (store only its hash) and create the administration.
 *  3. Dispatch the SCALE_INVITE notification (failure is swallowed — the link
 *     is always available via "Copiar link").
 * The raw token is only ever returned inside `link`. Consent is checked at the
 * call site (route/cron) before this is invoked.
 */
export async function sendScaleToPatient(params: SendScaleParams): Promise<SendScaleResult> {
  const def = getScaleDefinition(params.scaleCode)
  const now = new Date()
  const { token, tokenHash } = generateScaleToken()
  const expiresAt = computeExpiry(now)

  const administration = await prisma.$transaction(async (tx) => {
    const created = await tx.scaleAdministration.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        professionalProfileId: params.professionalProfileId,
        scheduleId: params.scheduleId ?? null,
        appointmentId: params.appointmentId ?? null,
        scaleCode: def.code,
        scaleVersion: def.version,
        source: "LINK_PACIENTE",
        status: "ENVIADA",
        answers: {},
        tokenHash,
        expiresAt,
        sentAt: now,
      },
    })

    // Supersede prior active sends of the same scale for this patient.
    await tx.scaleAdministration.updateMany({
      where: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        scaleCode: def.code,
        status: "ENVIADA",
        id: { not: created.id },
      },
      data: { status: "EXPIRADA", supersededById: created.id },
    })

    return created
  })

  const link = buildScaleUrl(params.baseUrl, token)

  await dispatchScaleInvite({
    clinicId: params.clinicId,
    patientId: params.patientId,
    professionalProfileId: params.professionalProfileId,
    channel: params.channel,
    scaleName: def.shortName,
    link,
  }).catch((err) => console.error("Failed to send SCALE_INVITE notification:", err))

  return { administration, link }
}

/**
 * Reactivates an ENVIADA/EXPIRADA administration with a fresh token, preserving
 * partial answers. Returns the new link. Used by the resend route.
 */
export async function resendScale(params: {
  clinicId: string
  administrationId: string
  channel: ScaleChannel
  baseUrl: string
}): Promise<{ link: string }> {
  const now = new Date()
  const { token, tokenHash } = generateScaleToken()
  const expiresAt = computeExpiry(now)

  const updated = await prisma.scaleAdministration.update({
    where: { id: params.administrationId },
    data: {
      status: "ENVIADA",
      tokenHash,
      expiresAt,
      sentAt: now,
      supersededById: null,
    },
    select: {
      clinicId: true,
      patientId: true,
      professionalProfileId: true,
      scaleCode: true,
    },
  })

  const def = getScaleDefinition(updated.scaleCode)
  const link = buildScaleUrl(params.baseUrl, token)

  await dispatchScaleInvite({
    clinicId: updated.clinicId,
    patientId: updated.patientId,
    professionalProfileId: updated.professionalProfileId,
    channel: params.channel,
    scaleName: def.shortName,
    link,
  }).catch((err) => console.error("Failed to resend SCALE_INVITE notification:", err))

  return { link }
}

/** Re-export the hash so routes resolving by token don't import tokens directly. */
export { hashScaleToken }

/**
 * Dispatches a SCALE_INVITE notification on the chosen channel. No-op if the
 * recipient field is empty (caller is responsible for consent gating).
 */
async function dispatchScaleInvite(args: {
  clinicId: string
  patientId: string
  professionalProfileId: string
  channel: ScaleChannel
  scaleName: string
  link: string
}): Promise<void> {
  const channel =
    args.channel === "EMAIL" ? NotificationChannel.EMAIL : NotificationChannel.WHATSAPP

  const [patient, professional, clinic] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: args.patientId },
      select: { name: true, email: true, phone: true },
    }),
    prisma.professionalProfile.findUnique({
      where: { id: args.professionalProfileId },
      select: { user: { select: { name: true } } },
    }),
    prisma.clinic.findUnique({ where: { id: args.clinicId }, select: { name: true } }),
  ])
  if (!patient) return

  const recipient = channel === NotificationChannel.EMAIL ? patient.email : patient.phone
  if (!recipient) return

  const variables = {
    patientName: patient.name,
    professionalName: professional?.user.name ?? "",
    scaleName: args.scaleName,
    scaleLink: args.link,
    clinicName: clinic?.name ?? "",
  }

  const template = await getTemplate(args.clinicId, NotificationType.SCALE_INVITE, channel)
  const content = renderTemplate(template.content, variables)
  const subject = template.subject ? renderTemplate(template.subject, variables) : undefined

  await createAndSendNotification({
    clinicId: args.clinicId,
    type: NotificationType.SCALE_INVITE,
    channel,
    recipient,
    subject,
    content,
    patientId: args.patientId,
  })
}
