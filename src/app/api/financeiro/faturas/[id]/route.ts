import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { audit, AuditAction } from "@/lib/rbac/audit"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: {
        patient: {
          select: {
            id: true, name: true, phone: true, email: true, cpf: true,
            billingCpf: true, billingResponsibleName: true,
            nfsePerAppointment: true, nfseObs: true,
            addressStreet: true, addressNumber: true, addressNeighborhood: true,
            addressCity: true, addressState: true, addressZip: true,
            motherName: true, sessionFee: true,
            referenceProfessional: { select: { id: true, user: { select: { name: true } } } },
          },
        },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        items: {
          include: {
            appointment: { select: { id: true, scheduledAt: true, status: true } },
            attendingProfessional: { select: { id: true, user: { select: { name: true } } } },
          },
          orderBy: [
            { appointment: { scheduledAt: "asc" } },
            { createdAt: "asc" },
          ],
        },
        consumedCredits: {
          select: { id: true, reason: true, createdAt: true },
        },
        nfseEmissions: {
          select: {
            id: true, invoiceItemId: true, status: true, numero: true,
            chaveAcesso: true, codigoVerificacao: true, emitidaAt: true,
            erro: true, canceladaAt: true, descricao: true, valor: true,
          },
          orderBy: { createdAt: "asc" },
        },
        reconciliationLinks: {
          select: {
            id: true,
            amount: true,
            reconciledAt: true,
            transaction: {
              select: { date: true, payerName: true, description: true, amount: true },
            },
          },
          orderBy: { reconciledAt: "asc" },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const { notaFiscalPdf, ...rest } = invoice
    return NextResponse.json({ ...rest, hasNotaFiscalPdf: !!notaFiscalPdf })
  }
)

const updateSchema = z.object({
  status: z.enum(["PENDENTE", "ENVIADO", "PARCIAL", "PAGO", "CANCELADO"]).optional(),
  notes: z.string().optional(),
  paidAt: z.string().datetime().optional().nullable(),
  notaFiscalEmitida: z.boolean().optional(),
  nfseStatus: z.enum(["EMITIDA_EXTERNA"]).nullable().optional(),
  dueDate: z.string().optional(),
})

export const PATCH = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    // Guard: block status change to CANCELADO when NFS-e is emitted
    if (
      (invoice.nfseStatus === "EMITIDA" || invoice.nfseStatus === "EMITIDA_EXTERNA") &&
      parsed.data.status === "CANCELADO"
    ) {
      return NextResponse.json(
        { error: "Nao e possivel cancelar fatura com NFS-e emitida. Cancele a NFS-e primeiro." },
        { status: 400 }
      )
    }

    // Guard: zero-value invoices cannot be marked as having NFS-e emitted
    if (parsed.data.nfseStatus === "EMITIDA_EXTERNA" && Number(invoice.totalAmount) <= 0) {
      return NextResponse.json(
        { error: "Não é possível emitir NFS-e para fatura com valor zero" },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.status) updateData.status = parsed.data.status
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes
    if (parsed.data.status === "PAGO") {
      updateData.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date()
    }
    if (parsed.data.dueDate) {
      updateData.dueDate = new Date(parsed.data.dueDate)
    }
    if (parsed.data.notaFiscalEmitida === true) {
      updateData.notaFiscalEmitida = true
      updateData.notaFiscalEmitidaAt = new Date()
    } else if (parsed.data.notaFiscalEmitida === false) {
      updateData.notaFiscalEmitida = false
      updateData.notaFiscalEmitidaAt = null
      updateData.notaFiscalPdf = null
    }
    if (parsed.data.nfseStatus === "EMITIDA_EXTERNA") {
      updateData.nfseStatus = "EMITIDA_EXTERNA"
      updateData.nfseEmitidaAt = new Date()
      updateData.notaFiscalEmitida = true
      updateData.notaFiscalEmitidaAt = new Date()
    } else if (parsed.data.nfseStatus === null && "nfseStatus" in parsed.data) {
      updateData.nfseStatus = null
      updateData.nfseEmitidaAt = null
      updateData.notaFiscalEmitida = false
      updateData.notaFiscalEmitidaAt = null
    }

    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: updateData,
    })

    if (parsed.data.status && parsed.data.status !== invoice.status) {
      audit.log({ user, action: AuditAction.INVOICE_STATUS_CHANGED, entityType: "Invoice", entityId: params.id, oldValues: { status: invoice.status }, newValues: { status: parsed.data.status }, request: req }).catch(() => {})
    }
    if (parsed.data.dueDate) {
      audit.log({ user, action: AuditAction.INVOICE_DUE_DATE_CHANGED, entityType: "Invoice", entityId: params.id, oldValues: { dueDate: invoice.dueDate?.toISOString() }, newValues: { dueDate: parsed.data.dueDate }, request: req }).catch(() => {})
    }
    if (parsed.data.notaFiscalEmitida !== undefined) {
      audit.log({ user, action: AuditAction.INVOICE_NF_CHANGED, entityType: "Invoice", entityId: params.id, oldValues: { notaFiscalEmitida: invoice.notaFiscalEmitida }, newValues: { notaFiscalEmitida: parsed.data.notaFiscalEmitida }, request: req }).catch(() => {})
    }
    if (parsed.data.notes !== undefined && parsed.data.notes !== invoice.notes) {
      audit.log({ user, action: AuditAction.INVOICE_NOTES_UPDATED, entityType: "Invoice", entityId: params.id, oldValues: { notes: invoice.notes }, newValues: { notes: parsed.data.notes }, request: req }).catch(() => {})
    }
    if ("nfseStatus" in parsed.data) {
      audit.log({ user, action: AuditAction.INVOICE_NF_CHANGED, entityType: "Invoice", entityId: params.id, oldValues: { nfseStatus: invoice.nfseStatus }, newValues: { nfseStatus: parsed.data.nfseStatus }, request: req }).catch(() => {})
    }

    return NextResponse.json(updated)
  }
)

export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    if (invoice.nfseStatus === "EMITIDA" || invoice.nfseStatus === "EMITIDA_EXTERNA") {
      return NextResponse.json(
        { error: "Nao e possivel excluir fatura com NFS-e emitida. Cancele/desmarque a NFS-e primeiro." },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.sessionCredit.updateMany({
        where: { consumedByInvoiceId: params.id },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })
      await tx.invoice.delete({ where: { id: params.id } })
    })

    audit.log({ user, action: AuditAction.INVOICE_DELETED, entityType: "Invoice", entityId: params.id, oldValues: { status: invoice.status, totalAmount: Number(invoice.totalAmount) }, request: req }).catch(() => {})

    return NextResponse.json({ success: true })
  }
)
