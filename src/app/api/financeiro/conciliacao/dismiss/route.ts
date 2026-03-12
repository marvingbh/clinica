import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const dismissSchema = z.object({
  transactionId: z.string(),
  reason: z.enum(["DUPLICATE", "NOT_PATIENT"]),
})

const undismissSchema = z.object({
  transactionId: z.string(),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = dismissSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { transactionId, reason } = parsed.data

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, clinicId: user.clinicId },
      include: { reconciliationLinks: { take: 1 } },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      )
    }

    if (transaction.reconciliationLinks.length > 0) {
      return NextResponse.json(
        { error: "Não é possível descartar uma transação já conciliada" },
        { status: 400 }
      )
    }

    if (transaction.dismissReason) {
      return NextResponse.json(
        { error: "Transação já descartada" },
        { status: 400 }
      )
    }

    await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        dismissReason: reason,
        dismissedAt: new Date(),
        dismissedByUserId: user.id,
      },
    })

    return NextResponse.json({ success: true })
  }
)

export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = undismissSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { transactionId } = parsed.data

    const transaction = await prisma.bankTransaction.findFirst({
      where: {
        id: transactionId,
        clinicId: user.clinicId,
        dismissReason: { not: null },
      },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: "Transação descartada não encontrada" },
        { status: 404 }
      )
    }

    await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        dismissReason: null,
        dismissedAt: null,
        dismissedByUserId: null,
      },
    })

    return NextResponse.json({ success: true })
  }
)
