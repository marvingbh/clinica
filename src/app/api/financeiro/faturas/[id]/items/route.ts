import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { recalculateInvoice } from "@/lib/financeiro/recalculate-invoice"

const addItemSchema = z.object({
  type: z.enum(["SESSAO_EXTRA", "REUNIAO_ESCOLA", "CREDITO"]),
  description: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const body = await req.json()
    const parsed = addItemSchema.safeParse(body)
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
      include: {
        patient: { select: { name: true, motherName: true, fatherName: true, sessionFee: true, invoiceMessageTemplate: true } },
        professionalProfile: { select: { user: { select: { name: true } } } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { invoiceMessageTemplate: true },
    })

    const { type, description, quantity, unitPrice } = parsed.data
    const isCredit = type === "CREDITO"
    const total = isCredit ? -(unitPrice * quantity) : unitPrice * quantity

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.invoiceItem.create({
        data: {
          invoiceId: params.id,
          type,
          description,
          quantity,
          unitPrice: isCredit ? -unitPrice : unitPrice,
          total,
        },
      })

      await recalculateInvoice(
        tx, params.id, invoice, invoice.patient,
        clinic?.invoiceMessageTemplate ?? null,
        invoice.professionalProfile.user.name,
      )

      return created
    })

    return NextResponse.json(item, { status: 201 })
  }
)
