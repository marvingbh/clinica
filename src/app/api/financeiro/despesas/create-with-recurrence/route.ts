import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { upsertCategoryPattern } from "@/lib/expense-matcher"

const schema = z.object({
  // Transaction details
  transactionId: z.string().optional(), // bank transaction to link
  description: z.string().min(1),
  supplierName: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: z.number().positive(),
  dueDate: z.string(), // YYYY-MM-DD for the first expense
  paymentMethod: z.string().nullable().optional(),
  // Recurrence config
  frequency: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
  dayOfMonth: z.number().int().min(1).max(31),
})

/**
 * POST /api/financeiro/despesas/create-with-recurrence
 * Creates an expense + recurrence template + pattern in one action.
 * Optionally links to a bank transaction (when created from import).
 */
export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const { transactionId, description, supplierName, categoryId, amount, dueDate, paymentMethod, frequency, dayOfMonth } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the recurrence template
      const recurrence = await tx.expenseRecurrence.create({
        data: {
          clinicId: user.clinicId,
          description,
          supplierName: supplierName ?? null,
          categoryId: categoryId ?? null,
          amount,
          paymentMethod: paymentMethod ?? null,
          frequency,
          dayOfMonth,
          startDate: new Date(dueDate),
          active: true,
        },
      })

      // 2. Create the first expense (PAID if from transaction, OPEN if manual)
      const isPaid = !!transactionId
      const expense = await tx.expense.create({
        data: {
          clinicId: user.clinicId,
          description,
          supplierName: supplierName ?? null,
          categoryId: categoryId ?? null,
          amount,
          dueDate: new Date(dueDate),
          status: isPaid ? "PAID" : "OPEN",
          paidAt: isPaid ? new Date(dueDate) : null,
          paymentMethod: paymentMethod ?? null,
          recurrenceId: recurrence.id,
          createdByUserId: user.id,
        },
      })

      // 3. Link to bank transaction if provided
      if (transactionId) {
        const bankTx = await tx.bankTransaction.findFirst({
          where: { id: transactionId, clinicId: user.clinicId },
        })
        if (!bankTx) throw new Error("Transação não encontrada")

        await tx.expenseReconciliationLink.create({
          data: {
            clinicId: user.clinicId,
            transactionId,
            expenseId: expense.id,
            amount,
            reconciledByUserId: user.id,
          },
        })
      }

      // 4. Save pattern with recurrenceId for auto-matching
      await upsertCategoryPattern(tx, user.clinicId, description, categoryId, supplierName, recurrence.id)

      return { expense, recurrence }
    })

    audit.log({
      user,
      action: AuditAction.EXPENSE_RECURRENCE_CREATED,
      entityType: "ExpenseRecurrence",
      entityId: result.recurrence.id,
      newValues: { description, amount, frequency, fromImport: !!transactionId },
      request: req,
    }).catch(() => {})

    return NextResponse.json(result, { status: 201 })
  }
)
