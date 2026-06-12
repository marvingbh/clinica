import { prisma } from "@/lib/prisma"
import { NotificationType, NotificationChannel } from "@prisma/client"
import { createNotification, createAndSendNotification } from "@/lib/notifications/notification-service"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { buildConfirmUrl, buildCancelUrl } from "@/lib/appointments/appointment-links"

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

/**
 * Notifies clinic staff (the professional + admins) that a new online booking
 * was received. Best-effort: callers wrap in try/catch so a notification
 * failure never fails the visitor's submission.
 */
export async function notifyStaffBookingReceived(params: {
  clinicId: string
  clinicName: string
  professionalProfileId: string
  contactName: string
  contactPhone: string
  professionalName: string
  scheduledAt: Date
  modality: string
}): Promise<void> {
  const { clinicId, clinicName, professionalProfileId } = params

  const [admins, professional, clinic] = await Promise.all([
    prisma.user.findMany({
      where: { clinicId, role: "ADMIN", isActive: true },
      select: { email: true },
    }),
    prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { user: { select: { email: true } } },
    }),
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { emailBcc: true } }),
  ])

  const template = await getTemplate(
    clinicId,
    NotificationType.ONLINE_BOOKING_RECEIVED,
    NotificationChannel.EMAIL
  )

  const variables = {
    patientName: params.contactName,
    phone: params.contactPhone,
    professionalName: params.professionalName,
    date: fmtDate(params.scheduledAt),
    time: fmtTime(params.scheduledAt),
    modality: params.modality === "ONLINE" ? "Online" : "Presencial",
    clinicName,
    requestsLink: `${baseUrl()}/agenda/solicitacoes`,
  }
  const content = renderTemplate(template.content, variables)
  const subject = template.subject ? renderTemplate(template.subject, variables) : undefined

  const recipients = new Set<string>()
  if (professional?.user.email) recipients.add(professional.user.email)
  for (const admin of admins) if (admin.email) recipients.add(admin.email)
  if (clinic?.emailBcc) recipients.add(clinic.emailBcc)

  for (const email of recipients) {
    await createAndSendNotification({
      clinicId,
      type: NotificationType.ONLINE_BOOKING_RECEIVED,
      channel: NotificationChannel.EMAIL,
      recipient: email,
      subject,
      content,
    })
  }
}

/**
 * Sends the appointment-confirmation notification (WhatsApp + email per consent)
 * to a patient whose auto-confirmed booking just created an appointment. Reuses
 * the existing APPOINTMENT_CONFIRMATION templates and HMAC confirm/cancel links.
 */
export async function notifyPatientConfirmation(params: {
  clinicId: string
  patientId: string
  appointmentId: string
  patientName: string
  patientEmail: string | null
  patientPhone: string | null
  consentWhatsApp: boolean
  consentEmail: boolean
  professionalName: string
  scheduledAt: Date
  modality: string
  clinicName: string
}): Promise<void> {
  const {
    clinicId,
    patientId,
    appointmentId,
    scheduledAt,
    consentWhatsApp,
    consentEmail,
  } = params

  const confirmLink = buildConfirmUrl(baseUrl(), appointmentId, scheduledAt)
  const cancelLink = buildCancelUrl(baseUrl(), appointmentId, scheduledAt)
  const variables = {
    patientName: params.patientName,
    professionalName: params.professionalName,
    date: fmtDate(scheduledAt),
    time: fmtTime(scheduledAt),
    modality: params.modality === "ONLINE" ? "Online" : "Presencial",
    confirmLink,
    cancelLink,
    clinicName: params.clinicName,
  }

  if (consentWhatsApp && params.patientPhone) {
    const tmpl = await getTemplate(
      clinicId,
      NotificationType.APPOINTMENT_CONFIRMATION,
      NotificationChannel.WHATSAPP
    )
    await createNotification({
      clinicId,
      patientId,
      appointmentId,
      type: NotificationType.APPOINTMENT_CONFIRMATION,
      channel: NotificationChannel.WHATSAPP,
      recipient: params.patientPhone,
      content: renderTemplate(tmpl.content, variables),
    })
  }

  if (consentEmail && params.patientEmail) {
    const tmpl = await getTemplate(
      clinicId,
      NotificationType.APPOINTMENT_CONFIRMATION,
      NotificationChannel.EMAIL
    )
    await createAndSendNotification({
      clinicId,
      patientId,
      appointmentId,
      type: NotificationType.APPOINTMENT_CONFIRMATION,
      channel: NotificationChannel.EMAIL,
      recipient: params.patientEmail,
      subject: tmpl.subject ? renderTemplate(tmpl.subject, variables) : undefined,
      content: renderTemplate(tmpl.content, variables),
    })
  }
}

/**
 * Sends the rejection courtesy message to a contact. Channel chosen by consent;
 * falls back to email when no WhatsApp consent. Best-effort.
 */
export async function notifyContactRejection(params: {
  clinicId: string
  patientName: string
  contactPhone: string
  contactEmail: string
  consentWhatsApp: boolean
  consentEmail: boolean
  scheduledAt: Date
  reason: string | null
  clinicName: string
}): Promise<void> {
  const { clinicId } = params
  const variables = {
    patientName: params.patientName,
    date: fmtDate(params.scheduledAt),
    time: fmtTime(params.scheduledAt),
    reason: params.reason ?? "",
    clinicName: params.clinicName,
  }

  if (params.consentWhatsApp) {
    const tmpl = await getTemplate(
      clinicId,
      NotificationType.ONLINE_BOOKING_REJECTED,
      NotificationChannel.WHATSAPP
    )
    await createNotification({
      clinicId,
      type: NotificationType.ONLINE_BOOKING_REJECTED,
      channel: NotificationChannel.WHATSAPP,
      recipient: params.contactPhone,
      content: renderTemplate(tmpl.content, variables),
    })
  } else if (params.consentEmail && params.contactEmail) {
    const tmpl = await getTemplate(
      clinicId,
      NotificationType.ONLINE_BOOKING_REJECTED,
      NotificationChannel.EMAIL
    )
    await createAndSendNotification({
      clinicId,
      type: NotificationType.ONLINE_BOOKING_REJECTED,
      channel: NotificationChannel.EMAIL,
      recipient: params.contactEmail,
      subject: tmpl.subject ? renderTemplate(tmpl.subject, variables) : undefined,
      content: renderTemplate(tmpl.content, variables),
    })
  }
}
