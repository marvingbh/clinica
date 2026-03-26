import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { findAutoReconcileMatches } from "@/lib/expenses"

/**
 * POST /api/financeiro/despesas/auto-reconcile
 * Finds and applies auto-reconcile matches between unmatched DEBIT
 * transactions and open recurring expenses.
 *
 * Returns auto-matched (applied) and suggested (pending user confirmation).
 */
export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    // Fetch unmatched DEBIT transactions
    const unmatchedTx = await prisma.bankTransaction.findMany({
      where: {
        clinicId: user.clinicId,
        type: "DEBIT",
        expenseReconciliationLinks: { none: {} },
        dismissReason: null,
      },
    })

    // Fetch open expenses (from recurrences primarily, but any open expense)
    const openExpenses = await prisma.expense.findMany({
      where: {
        clinicId: user.clinicId,
        status: { in: ["OPEN", "OVERDUE"] },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        description: true,
        recurrenceId: true,
        status: true,
      },
    })

    // Fetch patterns with recurrenceId
    const patterns = await prisma.expenseCategoryPattern.findMany({
      where: { clinicId: user.clinicId },
      include: { category: { select: { name: true } } },
    })

    const matches = findAutoReconcileMatches(
      unmatchedTx.map((tx) => ({
        id: tx.id,
        amount: Number(tx.amount),
        date: tx.date,
        description: tx.description,
      })),
      openExpenses.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        dueDate: e.dueDate,
        description: e.description,
        recurrenceId: e.recurrenceId,
        status: e.status,
      })),
      patterns.map((p) => ({
        normalizedDescription: p.normalizedDescription,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
        supplierName: p.supplierName,
        matchCount: p.matchCount,
        recurrenceId: p.recurrenceId,
      }))
    )

    // Apply auto matches
    const autoMatches = matches.filter((m) => m.confidence === "auto")
    const suggestions = matches.filter((m) => m.confidence === "suggested")

    let autoReconciled = 0
    for (const match of autoMatches) {
      await prisma.$transaction(async (tx) => {
        await tx.expenseReconciliationLink.create({
          data: {
            clinicId: user.clinicId,
            transactionId: match.transactionId,
            expenseId: match.expenseId,
            amount: match.amount,
            reconciledByUserId: user.id,
          },
        })

        await tx.expense.update({
          where: { id: match.expenseId },
          data: { status: "PAID", paidAt: new Date() },
        })
      })
      autoReconciled++
    }

    // Enrich suggestions with transaction and expense details for UI
    const enrichedSuggestions = await Promise.all(
      suggestions.map(async (s) => {
        const [tx, expense] = await Promise.all([
          prisma.bankTransaction.findUnique({ where: { id: s.transactionId }, select: { id: true, date: true, amount: true, description: true } }),
          prisma.expense.findUnique({ where: { id: s.expenseId }, select: { id: true, description: true, dueDate: true, amount: true } }),
        ])
        return { ...s, transaction: tx, expense }
      })
    )

    return NextResponse.json({
      autoReconciled,
      suggestions: enrichedSuggestions,
    })
  }
)
