import { prisma } from "@/lib/prisma"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { createAndSendNotification } from "@/lib/notifications"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { buildSigningUrl } from "./tokens"

/** Resolve the public app base URL (same precedent as other modules). */
export function signatureBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

function localDateTime(d: Date, tz: string): string {
  const date = d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" })
  const time = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
  return `${date} ${time}`
}

interface SignerContact {
  signerName: string
  signerEmail: string | null
  signerPhone: string | null
}

/**
 * Picks the delivery channel + recipient for a signer, honoring the requested
 * channel and falling back to email. Returns null when no contact is usable.
 */
export function resolveSignerChannel(
  signer: SignerContact,
  preferred: NotificationChannel | null
): { channel: NotificationChannel; recipient: string } | null {
  if (preferred === "EMAIL" && signer.signerEmail) {
    return { channel: NotificationChannel.EMAIL, recipient: signer.signerEmail }
  }
  if (preferred === "WHATSAPP" && signer.signerPhone) {
    return { channel: NotificationChannel.WHATSAPP, recipient: signer.signerPhone }
  }
  if (signer.signerEmail) return { channel: NotificationChannel.EMAIL, recipient: signer.signerEmail }
  if (signer.signerPhone) return { channel: NotificationChannel.WHATSAPP, recipient: signer.signerPhone }
  return null
}

/** Sends the signing-link notification to a signer for a freshly-minted token. */
export async function sendSigningLink(args: {
  clinicId: string
  clinicName: string
  patientId: string
  signer: SignerContact & { otpChannel: NotificationChannel | null }
  token: string
  documentTitle: string
  expiresAt: Date
  tz: string
}): Promise<NotificationChannel | null> {
  const resolved = resolveSignerChannel(args.signer, args.signer.otpChannel)
  if (!resolved) return null
  const template = await getTemplate(args.clinicId, NotificationType.DOCUMENT_SIGNATURE_REQUEST, resolved.channel)
  const variables = {
    signerName: args.signer.signerName,
    clinicName: args.clinicName,
    documentTitle: args.documentTitle,
    signingLink: buildSigningUrl(signatureBaseUrl(), args.token),
    expiresAt: localDateTime(args.expiresAt, args.tz),
  }
  await createAndSendNotification({
    clinicId: args.clinicId,
    patientId: args.patientId,
    type: NotificationType.DOCUMENT_SIGNATURE_REQUEST,
    channel: resolved.channel,
    recipient: resolved.recipient,
    subject: template.subject ? renderTemplate(template.subject, variables) : undefined,
    content: renderTemplate(template.content, variables),
  })
  return resolved.channel
}

/** Sends the OTP code to a signer on the given channel. */
export async function sendSigningOtp(args: {
  clinicId: string
  clinicName: string
  patientId: string
  recipient: string
  channel: NotificationChannel
  code: string
  documentTitle: string
}): Promise<void> {
  const template = await getTemplate(args.clinicId, NotificationType.DOCUMENT_SIGNATURE_OTP, args.channel)
  const variables = {
    code: args.code,
    clinicName: args.clinicName,
    documentTitle: args.documentTitle,
  }
  await createAndSendNotification({
    clinicId: args.clinicId,
    patientId: args.patientId,
    type: NotificationType.DOCUMENT_SIGNATURE_OTP,
    channel: args.channel,
    recipient: args.recipient,
    subject: template.subject ? renderTemplate(template.subject, variables) : undefined,
    content: renderTemplate(template.content, variables),
  })
}

/** Notifies the requesting staff that a document was signed. */
export async function notifyRequesterSigned(args: {
  clinicId: string
  clinicName: string
  patientId: string
  patientName: string
  documentTitle: string
  recipientEmail: string | null
}): Promise<void> {
  if (!args.recipientEmail) return
  const template = await getTemplate(args.clinicId, NotificationType.DOCUMENT_SIGNED, NotificationChannel.EMAIL)
  const variables = { patientName: args.patientName, documentTitle: args.documentTitle, clinicName: args.clinicName }
  await createAndSendNotification({
    clinicId: args.clinicId,
    patientId: args.patientId,
    type: NotificationType.DOCUMENT_SIGNED,
    channel: NotificationChannel.EMAIL,
    recipient: args.recipientEmail,
    subject: template.subject ? renderTemplate(template.subject, variables) : undefined,
    content: renderTemplate(template.content, variables),
  })
}

/**
 * Creates a Todo for the staff responsible for an envelope. Resolves the
 * assignee: requester's professionalProfileId → patient.referenceProfessionalId
 * → none (skip). Idempotent on sourceAppointmentId not used here.
 */
export async function createSignatureTodo(args: {
  clinicId: string
  requestedByUserId: string | null
  patientReferenceProfessionalId: string | null
  title: string
  day: Date
}): Promise<void> {
  let assigneeProfileId: string | null = null
  if (args.requestedByUserId) {
    const u = await prisma.user.findFirst({
      where: { id: args.requestedByUserId, clinicId: args.clinicId },
      select: { professionalProfile: { select: { id: true } } },
    })
    assigneeProfileId = u?.professionalProfile?.id ?? null
  }
  if (!assigneeProfileId) assigneeProfileId = args.patientReferenceProfessionalId
  if (!assigneeProfileId) return
  await prisma.todo.create({
    data: {
      clinicId: args.clinicId,
      professionalProfileId: assigneeProfileId,
      title: args.title,
      day: args.day,
    },
  })
}
