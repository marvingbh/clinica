import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { recalculateInvoice } from "@/lib/financeiro/recalculate-invoice"
import { audit, AuditAction } from "@/lib/rbac/audit"

const updateItemSchema = z.object({
  description: z.string().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().optional(),
})

async function getInvoiceWithContext(invoiceId: string, clinicId: string, scope: string, professionalProfileId: string | null) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      clinicId,
      ...(scope === "own" && professionalProfileId
        ? { professionalProfileId }
        : {}),
    },
    include: {
      patient: { select: { name: true, motherName: true, fatherName: true, sessionFee: true, invoiceMessageTemplate: true } },
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })
}

export const PATCH = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const body = await req.json()
    const parsed = updateItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const invoice = await getInvoiceWithContext(params.id, user.clinicId, scope, user.professionalProfileId ?? null)
    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    if (invoice.nfseStatus === "EMITIDA") {
      return NextResponse.json(
        { error: "Nao e possivel alterar itens de fatura com NFS-e emitida. Cancele a NFS-e primeiro." },
        { status: 400 }
      )
    }

    const item = await prisma.invoiceItem.findFirst({
      where: { id: params.itemId, invoiceId: params.id },
    })
    if (!item) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { invoiceMessageTemplate: true },
    })

    const isCredit = item.type === "CREDITO"
    const newQuantity = parsed.data.quantity ?? item.quantity
    const newUnitPrice = parsed.data.unitPrice !== undefined
      ? (isCredit ? -Math.abs(parsed.data.unitPrice) : parsed.data.unitPrice)
      : Number(item.unitPrice)
    const newTotal = newUnitPrice * newQuantity

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoiceItem.update({
        where: { id: params.itemId },
        data: {
          ...(parsed.data.description && { description: parsed.data.description }),
          quantity: newQuantity,
          unitPrice: newUnitPrice,
          total: newTotal,
        },
      })

      await recalculateInvoice(
        tx, params.id, invoice, invoice.patient,
        clinic?.invoiceMessageTemplate ?? null,
        invoice.professionalProfile.user.name,
      )

      return result
    })

    audit.log({
      user, action: AuditAction.INVOICE_ITEM_UPDATED, entityType: "Invoice", entityId: params.id,
      oldValues: { description: item.description, quantity: item.quantity, unitPrice: Number(item.unitPrice) },
      newValues: { description: updated.description, quantity: updated.quantity, unitPrice: Number(updated.unitPrice) },
      request: req,
    }).catch(() => {})

    return NextResponse.json(updated)
  }
)

export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"

    const invoice = await getInvoiceWithContext(params.id, user.clinicId, scope, user.professionalProfileId ?? null)
    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    if (invoice.nfseStatus === "EMITIDA") {
      return NextResponse.json(
        { error: "Nao e possivel remover itens de fatura com NFS-e emitida. Cancele a NFS-e primeiro." },
        { status: 400 }
      )
    }

    const item = await prisma.invoiceItem.findFirst({
      where: { id: params.itemId, invoiceId: params.id },
    })
    if (!item) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { invoiceMessageTemplate: true },
    })

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.delete({ where: { id: params.itemId } })

      await recalculateInvoice(
        tx, params.id, invoice, invoice.patient,
        clinic?.invoiceMessageTemplate ?? null,
        invoice.professionalProfile.user.name,
      )
    })

    audit.log({
      user, action: AuditAction.INVOICE_ITEM_DELETED, entityType: "Invoice", entityId: params.id,
      oldValues: { description: item.description, type: item.type, unitPrice: Number(item.unitPrice) },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ success: true })
  }
)
