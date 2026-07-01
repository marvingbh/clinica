import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { findReconcilableExpense, isValidTransition } from "@/lib/expenses"
import { upsertCategoryPattern } from "@/lib/expense-matcher"

const schema = z.object({
  transactionId: z.string(),
  description: z.string().min(1),
  supplierName: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: z.number().positive(),
  dueDate: z.string(), // YYYY-MM-DD
})

/**
 * POST /api/financeiro/despesas/from-transaction
 * Creates an "avulsa" expense from an imported bank transaction — but first checks whether an
 * existing OPEN/OVERDUE expense already covers this payment (typically one generated from a
 * recurrence). If so it reconciles against that instead of creating a duplicate.
 *
 * Returns `{ reused: boolean, expense }`.
 */
export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
    }
    const { transactionId, description, supplierName, categoryId, amount, dueDate } = parsed.data

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, clinicId: user.clinicId, type: "DEBIT" },
    })
    if (!transaction) {
      return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 })
    }

    // Look for an existing open expense this transaction would duplicate.
    const openExpenses = await prisma.expense.findMany({
      where: {
        clinicId: user.clinicId,
        status: { in: ["OPEN", "OVERDUE"] },
        reconciliationLinks: { none: {} },
      },
      select: { id: true, amount: true, dueDate: true, recurrenceId: true, categoryId: true, supplierName: true, status: true },
    })

    const reuseTarget = findReconcilableExpense(
      { amount, date: transaction.date },
      openExpenses.map((e) => ({ id: e.id, amount: Number(e.amount), dueDate: e.dueDate, recurrenceId: e.recurrenceId }))
    )

    const result = await prisma.$transaction(async (tx) => {
      if (reuseTarget) {
        // Reconcile against the existing expense — no duplicate created.
        const existing = openExpenses.find((e) => e.id === reuseTarget.id)!
        const expense = isValidTransition(existing.status, "PAID")
          ? await tx.expense.update({
              where: { id: existing.id },
              data: { status: "PAID", paidAt: transaction.date },
            })
          : await tx.expense.findUniqueOrThrow({ where: { id: existing.id } })

        await tx.expenseReconciliationLink.create({
          data: { clinicId: user.clinicId, transactionId, expenseId: existing.id, amount: transaction.amount, reconciledByUserId: user.id },
        })
        if (existing.categoryId) {
          await upsertCategoryPattern(tx, user.clinicId, transaction.description, existing.categoryId, existing.supplierName)
        }
        return { reused: true, expense }
      }

      // No match — create the avulsa expense, mark paid, link.
      const expense = await tx.expense.create({
        data: {
          clinicId: user.clinicId,
          description,
          supplierName: supplierName ?? null,
          categoryId: categoryId ?? null,
          amount,
          dueDate: new Date(dueDate),
          status: "PAID",
          paidAt: transaction.date,
          createdByUserId: user.id,
        },
      })
      await tx.expenseReconciliationLink.create({
        data: { clinicId: user.clinicId, transactionId, expenseId: expense.id, amount: transaction.amount, reconciledByUserId: user.id },
      })
      if (categoryId) {
        await upsertCategoryPattern(tx, user.clinicId, transaction.description, categoryId, supplierName ?? null)
      }
      return { reused: false, expense }
    })

    audit.log({
      user,
      action: result.reused ? AuditAction.EXPENSE_STATUS_CHANGED : AuditAction.EXPENSE_CREATED,
      entityType: "Expense",
      entityId: result.expense.id,
      newValues: { description, amount, reused: result.reused, transactionId },
      request: req,
    }).catch(() => {})

    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  }
)
