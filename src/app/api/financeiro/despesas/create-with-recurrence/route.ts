import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { upsertCategoryPattern } from "@/lib/expense-matcher"
import { findMatchingRecurrence } from "@/lib/expenses/match-recurrence"

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
      // 1. Reuse an existing active recurrence for the same payment if one exists, otherwise
      // create a new template. Avoids the duplicate-template proliferation that produced
      // parallel monthly expenses (e.g. the same supplier on days 2/4/30).
      const activeRecurrences = await tx.expenseRecurrence.findMany({
        where: { clinicId: user.clinicId, active: true },
        select: { id: true, description: true, amount: true, frequency: true },
      })
      const existingMatch = findMatchingRecurrence(
        { description, amount, frequency },
        activeRecurrences.map((r) => ({ ...r, amount: Number(r.amount) }))
      )

      const recurrence = existingMatch
        ? await tx.expenseRecurrence.findUniqueOrThrow({ where: { id: existingMatch.id } })
        : await tx.expenseRecurrence.create({
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

      // 2. Resolve the expense for this payment. When reusing an existing recurrence the cron
      // may already have generated an OPEN/OVERDUE expense for this month — reconcile against it
      // instead of creating a duplicate. Otherwise create a fresh one.
      const isPaid = !!transactionId
      const due = new Date(dueDate)
      const monthStart = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), 1))
      const monthEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0))

      const openForMonth = existingMatch
        ? await tx.expense.findFirst({
            where: {
              clinicId: user.clinicId,
              recurrenceId: recurrence.id,
              status: { in: ["OPEN", "OVERDUE"] },
              dueDate: { gte: monthStart, lte: monthEnd },
            },
            orderBy: { dueDate: "asc" },
          })
        : null

      const expense = openForMonth
        ? await tx.expense.update({
            where: { id: openForMonth.id },
            data: isPaid ? { status: "PAID", paidAt: due } : {},
          })
        : await tx.expense.create({
            data: {
              clinicId: user.clinicId,
              description,
              supplierName: supplierName ?? null,
              categoryId: categoryId ?? null,
              amount,
              dueDate: due,
              status: isPaid ? "PAID" : "OPEN",
              paidAt: isPaid ? due : null,
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
