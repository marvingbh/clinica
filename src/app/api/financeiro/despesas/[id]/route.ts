import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { isValidTransition } from "@/lib/expenses"

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  supplierName: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional(),
  paymentMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "OPEN", "PAID", "OVERDUE", "CANCELLED"]).optional(),
})

export const GET = withFeatureAuth(
  { feature: "expenses", minAccess: "READ" },
  async (req, { user }, params) => {
    const expense = await prisma.expense.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        category: { select: { id: true, name: true, color: true } },
        recurrence: { select: { id: true, description: true, frequency: true } },
        reconciliationLinks: {
          include: { transaction: { select: { id: true, date: true, description: true, amount: true } } },
        },
      },
    })

    if (!expense) {
      return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 })
    }

    return NextResponse.json(expense)
  }
)

export const PATCH = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const expense = await prisma.expense.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
    })

    if (!expense) {
      return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 })
    }

    // Validate status transition if changing status
    if (parsed.data.status && parsed.data.status !== expense.status) {
      if (!isValidTransition(expense.status, parsed.data.status)) {
        return NextResponse.json(
          { error: `Transição de status inválida: ${expense.status} → ${parsed.data.status}` },
          { status: 400 }
        )
      }
    }

    const data: Record<string, unknown> = {}
    if (parsed.data.description !== undefined) data.description = parsed.data.description
    if (parsed.data.supplierName !== undefined) data.supplierName = parsed.data.supplierName
    if (parsed.data.categoryId !== undefined) data.categoryId = parsed.data.categoryId
    if (parsed.data.amount !== undefined) data.amount = parsed.data.amount
    if (parsed.data.dueDate !== undefined) data.dueDate = new Date(parsed.data.dueDate)
    if (parsed.data.paymentMethod !== undefined) data.paymentMethod = parsed.data.paymentMethod
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status
      if (parsed.data.status === "PAID") data.paidAt = new Date()
    }

    const updated = await prisma.expense.update({
      where: { id: params.id },
      data,
      include: { category: { select: { id: true, name: true, color: true } } },
    })

    if (parsed.data.status && parsed.data.status !== expense.status) {
      audit.log({
        user,
        action: AuditAction.EXPENSE_STATUS_CHANGED,
        entityType: "Expense",
        entityId: params.id,
        oldValues: { status: expense.status },
        newValues: { status: parsed.data.status },
        request: req,
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  }
)

export const DELETE = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const expense = await prisma.expense.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
    })

    if (!expense) {
      return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 })
    }

    await prisma.expense.delete({ where: { id: params.id } })

    audit.log({
      user,
      action: AuditAction.EXPENSE_DELETED,
      entityType: "Expense",
      entityId: params.id,
      oldValues: { description: expense.description, amount: Number(expense.amount) },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ success: true })
  }
)
