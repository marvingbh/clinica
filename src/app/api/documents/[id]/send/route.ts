import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { emailResendProvider } from "@/lib/notifications/providers/email-resend"
import { whatsAppMockProvider } from "@/lib/notifications/providers/whatsapp-mock"
import {
  buildDocumentEmailHtml,
  buildDocumentWhatsAppMessage,
  buildDocumentDownloadUrl,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/documents"
import { resolveClinicSender } from "@/lib/email/sender"
import { canAccessPatientDocuments } from "../../_lib/scope"
import { documentFileName } from "../../_lib/render-pdf"

const bodySchema = z
  .object({
    channel: z.enum(["EMAIL", "WHATSAPP"]),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
  })
  .refine((d) => (d.channel === "EMAIL" ? !!d.email : !!d.phone), {
    message: "Destinatário obrigatório para o canal selecionado",
  })

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

export const POST = withFeatureAuth(
  { feature: "documents", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }, params) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const doc = await prisma.generatedDocument.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: {
        id: true, title: true, templateType: true, patientId: true, pdfData: true,
        patient: { select: { name: true, billingResponsibleName: true } },
        clinic: { select: { name: true, email: true, phone: true, address: true, emailSenderName: true, emailFromAddress: true, emailBcc: true, timezone: true, emailDomain: true, emailDomainStatus: true } },
        createdAt: true,
      },
    })
    if (!doc || !doc.pdfData) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }
    if (!(await canAccessPatientDocuments(user, doc.patientId))) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }

    const { channel } = parsed.data
    const typeLabel = DOCUMENT_TYPE_LABELS[doc.templateType]
    let recipient: string

    if (channel === "EMAIL") {
      recipient = parsed.data.email!
      const sender = resolveClinicSender(doc.clinic)
      if (!process.env.RESEND_API_KEY || !sender) {
        return NextResponse.json({ error: "Serviço de e-mail não configurado" }, { status: 400 })
      }
      const generatedDate = doc.createdAt.toLocaleDateString("pt-BR", { timeZone: doc.clinic.timezone, day: "2-digit", month: "2-digit", year: "numeric" })
      const html = buildDocumentEmailHtml({
        recipientName: doc.patient.billingResponsibleName || doc.patient.name,
        documentTitle: doc.title,
        documentTypeLabel: typeLabel,
        clinicName: doc.clinic.name,
        generatedDate,
        clinicPhone: doc.clinic.phone,
        clinicEmail: doc.clinic.email,
        clinicAddress: doc.clinic.address,
      })
      const sendResult = await emailResendProvider.send(recipient, "Segue o documento solicitado em anexo.", `${typeLabel} — ${doc.clinic.name}`, {
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        replyTo: sender.replyTo,
        html,
        attachments: [{ filename: documentFileName(doc.title), content: Buffer.from(doc.pdfData).toString("base64"), content_type: "application/pdf" }],
      })
      if (!sendResult.success) {
        return NextResponse.json({ error: sendResult.error || "Erro ao enviar e-mail" }, { status: 500 })
      }
    } else {
      recipient = parsed.data.phone!
      const downloadUrl = buildDocumentDownloadUrl(baseUrl(), doc.id)
      const message = buildDocumentWhatsAppMessage({ clinicName: doc.clinic.name, documentTypeLabel: typeLabel, downloadUrl })
      const sendResult = await whatsAppMockProvider.send(recipient, message)
      if (!sendResult.success) {
        return NextResponse.json({ error: "Erro ao enviar mensagem" }, { status: 500 })
      }
    }

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { sentToEmail: recipient, sentAt: new Date() },
    })

    await audit.log({
      user,
      action: AuditAction.DOCUMENT_SENT,
      entityType: "GeneratedDocument",
      entityId: doc.id,
      newValues: { templateType: doc.templateType, patientId: doc.patientId, channel, recipient },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  }
)
