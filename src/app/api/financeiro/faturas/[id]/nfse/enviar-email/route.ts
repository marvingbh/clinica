import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { renderToBuffer } from "@react-pdf/renderer"
import { buildDanfseData } from "@/lib/nfse/danfse-data-builder"
import { createDanfseDocument } from "@/lib/nfse/danfse-pdf"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { buildNfseEmailHtml } from "@/lib/nfse/email-template"
import type { AuthUser } from "@/lib/rbac/types"

const bodySchema = z.object({
  email: z.string().email("E-mail inválido"),
  emissionId: z.string().optional(),
})

async function generatePdf(
  invoice: NonNullable<Awaited<ReturnType<typeof fetchInvoice>>>,
  emissionId: string | undefined,
) {
  const nfseConfig = invoice.clinic.nfseConfig!

  if (emissionId) {
    const emission = await prisma.nfseEmission.findFirst({
      where: { id: emissionId, invoiceId: invoice.id },
    })
    if (!emission || emission.status !== "EMITIDA" || !emission.chaveAcesso) {
      return { error: "NFS-e não emitida para esta emissão" }
    }

    const danfseData = buildDanfseData({
      nfseNumero: emission.numero,
      nfseChaveAcesso: emission.chaveAcesso,
      nfseCodigoVerificacao: emission.codigoVerificacao,
      nfseEmitidaAt: emission.emitidaAt,
      nfseDescricao: emission.descricao,
      nfseAliquotaIss: nfseConfig.aliquotaIss,
      nfseCodigoServico: nfseConfig.codigoServico,
      nfseXml: emission.xml,
      totalAmount: emission.valor,
      patient: invoice.patient,
      clinic: invoice.clinic,
    })
    if (!danfseData) return { error: "Erro ao gerar dados do DANFSE" }

    const QRCode = await import("qrcode")
    danfseData.qrCodeDataUri = await QRCode.toDataURL(danfseData.verificacaoUrl, { width: 120, margin: 1 })
    const buf = await renderToBuffer(createDanfseDocument(danfseData))
    return {
      buffer: Buffer.from(buf),
      numero: emission.numero || "sem-numero",
      emitidaAt: emission.emitidaAt,
      descricao: danfseData.descricao,
      valor: danfseData.valorTotal,
      codigoVerificacao: danfseData.codigoVerificacao,
    }
  }

  // Per-invoice mode
  if (invoice.nfseStatus !== "EMITIDA" || !invoice.nfseChaveAcesso) {
    return { error: "NFS-e não emitida para esta fatura" }
  }

  const danfseData = buildDanfseData(invoice)
  if (!danfseData) return { error: "Erro ao gerar dados do DANFSE" }

  const QRCode = await import("qrcode")
  danfseData.qrCodeDataUri = await QRCode.toDataURL(danfseData.verificacaoUrl, { width: 120, margin: 1 })
  const buf = await renderToBuffer(createDanfseDocument(danfseData))
  return {
    buffer: Buffer.from(buf),
    numero: invoice.nfseNumero || "sem-numero",
    emitidaAt: invoice.nfseEmitidaAt,
    descricao: danfseData.descricao,
    valor: danfseData.valorTotal,
    codigoVerificacao: danfseData.codigoVerificacao,
    verificacaoUrl: danfseData.verificacaoUrl,
  }
}

async function fetchInvoice(invoiceId: string, clinicId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, clinicId },
    include: {
      patient: {
        select: {
          id: true, name: true, email: true,
          billingResponsibleName: true, billingCpf: true, cpf: true,
          addressStreet: true, addressNumber: true, addressNeighborhood: true,
          addressCity: true, addressState: true, addressZip: true,
        },
      },
      clinic: {
        select: {
          name: true, email: true, phone: true, address: true,
          emailSenderName: true, emailFromAddress: true, emailBcc: true,
          nfseConfig: true,
        },
      },
    },
  })
}

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }, params) => {
    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { email, emissionId } = parsed.data

    try {
      const invoice = await fetchInvoice(params.id, user.clinicId)
      if (!invoice) {
        return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
      }
      if (!invoice.clinic.nfseConfig) {
        return NextResponse.json({ error: "Configuração NFS-e não encontrada" }, { status: 400 })
      }

      const result = await generatePdf(invoice, emissionId)
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      const { buffer: pdfBuffer, numero: nfseNumero, emitidaAt, descricao, valor, codigoVerificacao } = result

      // Send email via Resend
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) {
        return NextResponse.json({ error: "Serviço de e-mail não configurado" }, { status: 500 })
      }

      const fromEmail = invoice.clinic.emailFromAddress || process.env.RESEND_FROM_EMAIL
      if (!fromEmail) {
        return NextResponse.json({ error: "Endereço de envio de e-mail não configurado. Configure em Configurações > E-mail." }, { status: 400 })
      }
      const fromName = invoice.clinic.emailSenderName || invoice.clinic.name
      const emissionDate = emitidaAt
        ? new Date(emitidaAt).toLocaleDateString("pt-BR")
        : new Date().toLocaleDateString("pt-BR")

      const html = buildNfseEmailHtml({
        patientName: invoice.patient.name,
        nfseNumero,
        clinicName: invoice.clinic.name,
        emissionDate,
        valor,
        descricao,
        codigoVerificacao,
        clinicPhone: invoice.clinic.phone,
        clinicEmail: invoice.clinic.email,
        clinicAddress: invoice.clinic.address,
      })

      const fileName = `NFS-e-${nfseNumero}-${invoice.patient.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")}.pdf`

      const emailPayload: Record<string, unknown> = {
        from: `${fromName} <${fromEmail}>`,
        to: [email],
        reply_to: invoice.clinic.email || undefined,
        subject: `NFS-e #${nfseNumero} - ${invoice.clinic.name}`,
        html,
        attachments: [{ filename: fileName, content: pdfBuffer.toString("base64") }],
      }
      if (invoice.clinic.emailBcc) {
        emailPayload.bcc = [invoice.clinic.emailBcc]
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[NFS-e Email] Resend error:", errorData)
        const resendMsg = errorData?.message || "Erro ao enviar e-mail"
        return NextResponse.json({ error: resendMsg }, { status: 500 })
      }

      // Update patient email if changed
      if (email !== invoice.patient.email) {
        await prisma.patient.update({
          where: { id: invoice.patient.id },
          data: { email },
        })
      }

      audit.log({
        user,
        action: AuditAction.NFSE_EMAILED,
        entityType: "Invoice",
        entityId: invoice.id,
        newValues: { email, nfseNumero, ...(emissionId ? { emissionId } : {}) },
        request: req,
      }).catch(() => {})

      return NextResponse.json({ success: true })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido"
      console.error("[NFS-e Email] Unhandled error:", error)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
)
