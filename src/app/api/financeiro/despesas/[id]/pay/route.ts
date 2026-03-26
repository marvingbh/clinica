import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { isValidTransition } from "@/lib/expenses"

export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const expense = await prisma.expense.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
    })

    if (!expense) {
      return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 })
    }

    if (!isValidTransition(expense.status, "PAID")) {
      return NextResponse.json(
        { error: `Não é possível marcar como pago a partir do status ${expense.status}` },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))

    const updated = await prisma.expense.update({
      where: { id: params.id },
      data: {
        status: "PAID",
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
      },
      include: { category: { select: { id: true, name: true, color: true } } },
    })

    audit.log({
      user,
      action: AuditAction.EXPENSE_STATUS_CHANGED,
      entityType: "Expense",
      entityId: params.id,
      oldValues: { status: expense.status },
      newValues: { status: "PAID", paidAt: updated.paidAt },
      request: req,
    }).catch(() => {})

    return NextResponse.json(updated)
  }
)
