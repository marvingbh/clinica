import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: {
        patient: { select: { id: true, name: true, phone: true, motherName: true } },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        items: {
          include: {
            appointment: { select: { id: true, scheduledAt: true, status: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        consumedCredits: {
          select: { id: true, reason: true, createdAt: true },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura n\u00e3o encontrada" }, { status: 404 })
    }

    return NextResponse.json(invoice)
  }
)

const updateSchema = z.object({
  status: z.enum(["PENDENTE", "PAGO", "CANCELADO"]).optional(),
  notes: z.string().optional(),
  paidAt: z.string().datetime().optional().nullable(),
})

export const PATCH = withAuth(
  { resource: "invoice", action: "update" },
  async (req: NextRequest, { user, scope }, params) => {
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
      return NextResponse.json({ error: "Fatura n\u00e3o encontrada" }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.status) updateData.status = parsed.data.status
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes
    if (parsed.data.status === "PAGO") {
      updateData.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date()
    }

    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json(updated)
  }
)

export const DELETE = withAuth(
  { resource: "invoice", action: "delete" },
  async (req: NextRequest, { user, scope }, params) => {
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
      return NextResponse.json({ error: "Fatura n\u00e3o encontrada" }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.sessionCredit.updateMany({
        where: { consumedByInvoiceId: params.id },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })
      await tx.invoice.delete({ where: { id: params.id } })
    })

    return NextResponse.json({ success: true })
  }
)
