import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  supplierName: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: z.number().positive().optional(),
  paymentMethod: z.string().nullable().optional(),
  frequency: z.enum(["MONTHLY", "YEARLY"]).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  endDate: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

export const PATCH = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const recurrence = await prisma.expenseRecurrence.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
    })
    if (!recurrence) {
      return NextResponse.json({ error: "Recorrência não encontrada" }, { status: 404 })
    }

    // If deactivating, also cancel future OPEN/DRAFT expenses
    if (parsed.data.active === false && recurrence.active) {
      await prisma.$transaction(async (tx) => {
        await tx.expense.updateMany({
          where: {
            recurrenceId: params.id,
            clinicId: user.clinicId,
            status: { in: ["OPEN", "DRAFT"] },
            dueDate: { gt: new Date() },
          },
          data: { status: "CANCELLED" },
        })

        await tx.expenseRecurrence.update({
          where: { id: params.id },
          data: { active: false },
        })
      })

      audit.log({
        user,
        action: AuditAction.EXPENSE_RECURRENCE_DEACTIVATED,
        entityType: "ExpenseRecurrence",
        entityId: params.id,
        oldValues: { active: true },
        newValues: { active: false },
        request: req,
      }).catch(() => {})

      const updated = await prisma.expenseRecurrence.findUnique({ where: { id: params.id } })
      return NextResponse.json(updated)
    }

    const data: Prisma.ExpenseRecurrenceUncheckedUpdateInput = {}
    if (parsed.data.description !== undefined) data.description = parsed.data.description
    if (parsed.data.supplierName !== undefined) data.supplierName = parsed.data.supplierName
    if (parsed.data.categoryId !== undefined) data.categoryId = parsed.data.categoryId
    if (parsed.data.amount !== undefined) data.amount = parsed.data.amount
    if (parsed.data.paymentMethod !== undefined) data.paymentMethod = parsed.data.paymentMethod
    if (parsed.data.frequency !== undefined) data.frequency = parsed.data.frequency
    if (parsed.data.dayOfMonth !== undefined) data.dayOfMonth = parsed.data.dayOfMonth
    if (parsed.data.endDate !== undefined) data.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null
    if (parsed.data.active !== undefined) data.active = parsed.data.active

    const updated = await prisma.expenseRecurrence.update({
      where: { id: params.id },
      data,
    })

    audit.log({
      user,
      action: AuditAction.EXPENSE_RECURRENCE_UPDATED,
      entityType: "ExpenseRecurrence",
      entityId: params.id,
      newValues: parsed.data,
      request: req,
    }).catch(() => {})

    return NextResponse.json(updated)
  }
)

export const DELETE = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const recurrence = await prisma.expenseRecurrence.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
    })
    if (!recurrence) {
      return NextResponse.json({ error: "Recorrência não encontrada" }, { status: 404 })
    }

    await prisma.expenseRecurrence.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  }
)
