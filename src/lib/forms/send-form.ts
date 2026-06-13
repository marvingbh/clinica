import { prisma } from "@/lib/prisma"
import { NotificationChannel, NotificationType, type FormResponse, type FormSentVia } from "@prisma/client"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { generateFormToken, buildFormUrl, computeFormExpiry } from "./tokens"

export class SendFormError extends Error {
  constructor(
    message: string,
    readonly code: "TEMPLATE_NOT_FOUND" | "NO_PUBLISHED_VERSION" | "PATIENT_NOT_FOUND"
  ) {
    super(message)
    this.name = "SendFormError"
  }
}

export interface SendFormParams {
  clinicId: string
  templateId: string
  patientId: string
  sentByUserId: string | null
  professionalProfileId: string | null
  sentVia: FormSentVia
  expiresInDays?: number
  baseUrl: string
}

export interface SendFormResult {
  response: FormResponse
  formUrl: string
}

/**
 * Sends a published form to a patient. Pure DB + notification orchestration:
 *  1. resolve the active template's latest published version (clinic-scoped);
 *  2. validate the patient belongs to the clinic;
 *  3. supersede any pending response for the same template+patient → EXPIRADO;
 *  4. mint a random token (store only its hash) and create the FormResponse;
 *  5. for WHATSAPP/EMAIL, fire a FORM_REQUEST notification with the link.
 *
 * The raw token is only ever returned inside `formUrl`.
 */
export async function sendFormToPatient(params: SendFormParams): Promise<SendFormResult> {
  const { clinicId, templateId, patientId, sentByUserId, professionalProfileId, sentVia } = params

  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, clinicId, isActive: true },
    select: { id: true, name: true },
  })
  if (!template) {
    throw new SendFormError("Modelo não encontrado ou inativo", "TEMPLATE_NOT_FOUND")
  }

  const latestVersion = await prisma.formVersion.findFirst({
    where: { templateId, clinicId },
    orderBy: { version: "desc" },
    select: { id: true },
  })
  if (!latestVersion) {
    throw new SendFormError("Modelo sem versão publicada", "NO_PUBLISHED_VERSION")
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true, name: true, email: true, phone: true },
  })
  if (!patient) {
    throw new SendFormError("Paciente não encontrado", "PATIENT_NOT_FOUND")
  }

  // Supersede previous pending sends of the same template for this patient.
  await prisma.formResponse.updateMany({
    where: {
      clinicId,
      patientId,
      formVersion: { templateId },
      status: { in: ["ENVIADO", "EM_PREENCHIMENTO"] },
    },
    data: { status: "EXPIRADO" },
  })

  const now = new Date()
  const { token, tokenHash } = generateFormToken()
  const expiresAt = computeFormExpiry(now, params.expiresInDays)

  const response = await prisma.formResponse.create({
    data: {
      clinicId,
      patientId,
      formVersionId: latestVersion.id,
      professionalProfileId,
      sentByUserId,
      status: "ENVIADO",
      answers: {},
      sentVia,
      expiresAt,
      tokenHash,
    },
  })

  const formUrl = buildFormUrl(params.baseUrl, token)

  if (sentVia !== "LINK") {
    await dispatchFormRequest({
      clinicId,
      sentVia,
      patient,
      formName: template.name,
      formUrl,
      expiresAt,
    })
  }

  return { response, formUrl }
}

/**
 * Sends a FORM_REQUEST notification on the WhatsApp/EMAIL channel. A delivery
 * failure is swallowed (logged) so the caller's write is never rolled back —
 * the link is always available via "Copiar link". Reused by send + resend.
 */
export async function dispatchFormRequest(args: {
  clinicId: string
  sentVia: FormSentVia
  patient: { name: string; email: string | null; phone: string | null }
  formName: string
  formUrl: string
  expiresAt: Date
}): Promise<void> {
  const channel =
    args.sentVia === "EMAIL" ? NotificationChannel.EMAIL : NotificationChannel.WHATSAPP
  const recipient = channel === NotificationChannel.EMAIL ? args.patient.email : args.patient.phone
  if (!recipient) return

  const clinic = await prisma.clinic.findUnique({
    where: { id: args.clinicId },
    select: { name: true },
  })

  const variables = {
    patientName: args.patient.name,
    clinicName: clinic?.name ?? "",
    formName: args.formName,
    formLink: args.formUrl,
    expiryDate: args.expiresAt.toLocaleDateString("pt-BR"),
  }

  const template = await getTemplate(args.clinicId, NotificationType.FORM_REQUEST, channel)
  const content = renderTemplate(template.content, variables)
  const subject = template.subject ? renderTemplate(template.subject, variables) : undefined

  try {
    await createAndSendNotification({
      clinicId: args.clinicId,
      type: NotificationType.FORM_REQUEST,
      channel,
      recipient,
      subject,
      content,
    })
  } catch (err) {
    // A notification failure must not roll back the FormResponse — the link
    // is always available via "Copiar link".
    console.error("Failed to send FORM_REQUEST notification:", err)
  }
}
