import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { findAutoReconcileMatches, findRecurrenceCreationCandidates } from "@/lib/expenses"

/**
 * POST /api/financeiro/despesas/auto-reconcile
 * Finds and applies auto-reconcile matches between unmatched DEBIT
 * transactions and open recurring expenses.
 *
 * Also auto-creates expenses from recurrence templates when a transaction
 * matches a known pattern linked to an active recurrence.
 */
export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const [unmatchedTx, openExpenses, patterns, activeRecurrences] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          clinicId: user.clinicId,
          type: "DEBIT",
          expenseReconciliationLinks: { none: {} },
          dismissReason: null,
        },
      }),
      prisma.expense.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["OPEN", "OVERDUE"] },
        },
        select: { id: true, amount: true, dueDate: true, description: true, recurrenceId: true, status: true },
      }),
      prisma.expenseCategoryPattern.findMany({
        where: { clinicId: user.clinicId },
        include: { category: { select: { name: true } } },
      }),
      prisma.expenseRecurrence.findMany({
        where: { clinicId: user.clinicId, active: true },
        select: { id: true, amount: true, description: true, supplierName: true, categoryId: true, paymentMethod: true },
      }),
    ])

    const mappedTx = unmatchedTx.map((tx) => ({ id: tx.id, amount: Number(tx.amount), date: tx.date, description: tx.description }))
    const mappedExpenses = openExpenses.map((e) => ({ id: e.id, amount: Number(e.amount), dueDate: e.dueDate, description: e.description, recurrenceId: e.recurrenceId, status: e.status }))
    const mappedPatterns = patterns.map((p) => ({ normalizedDescription: p.normalizedDescription, categoryId: p.categoryId, categoryName: p.category?.name ?? null, supplierName: p.supplierName, matchCount: p.matchCount, recurrenceId: p.recurrenceId }))

    // Phase 1: Match transactions to existing open expenses
    const matches = findAutoReconcileMatches(mappedTx, mappedExpenses, mappedPatterns)

    const autoMatches = matches.filter((m) => m.confidence === "auto")
    const suggestions = matches.filter((m) => m.confidence === "suggested")

    let autoReconciled = 0
    for (const match of autoMatches) {
      await prisma.$transaction(async (tx) => {
        await tx.expenseReconciliationLink.create({
          data: { clinicId: user.clinicId, transactionId: match.transactionId, expenseId: match.expenseId, amount: match.amount, reconciledByUserId: user.id },
        })
        await tx.expense.update({ where: { id: match.expenseId }, data: { status: "PAID", paidAt: new Date() } })
      })
      autoReconciled++
    }

    // Phase 2: Auto-create expenses from recurrence templates
    const matchedTxIds = new Set(matches.map((m) => m.transactionId))
    const recurrenceMap = new Map(activeRecurrences.map((r) => [r.id, { amount: Number(r.amount) }]))

    const candidates = findRecurrenceCreationCandidates(mappedTx, mappedPatterns, matchedTxIds, recurrenceMap)

    for (const candidate of candidates) {
      const txRecord = unmatchedTx.find((t) => t.id === candidate.transactionId)!
      const recurrence = activeRecurrences.find((r) => r.id === candidate.recurrenceId)!

      // Prevent duplicates: check if expense already exists for this recurrence in the same month
      // Use UTC methods — Prisma @db.Date returns UTC midnight, local timezone would shift the month
      const txDate = txRecord.date
      const monthStart = new Date(Date.UTC(txDate.getUTCFullYear(), txDate.getUTCMonth(), 1))
      const monthEnd = new Date(Date.UTC(txDate.getUTCFullYear(), txDate.getUTCMonth() + 1, 0))

      const existing = await prisma.expense.findFirst({
        where: { clinicId: user.clinicId, recurrenceId: candidate.recurrenceId, dueDate: { gte: monthStart, lte: monthEnd } },
      })
      if (existing) continue

      await prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            clinicId: user.clinicId,
            description: recurrence.description,
            supplierName: recurrence.supplierName,
            categoryId: recurrence.categoryId,
            amount: candidate.amount,
            dueDate: txDate,
            status: "PAID",
            paidAt: txDate,
            paymentMethod: recurrence.paymentMethod,
            recurrenceId: candidate.recurrenceId,
          },
        })
        await tx.expenseReconciliationLink.create({
          data: { clinicId: user.clinicId, transactionId: candidate.transactionId, expenseId: expense.id, amount: candidate.amount, reconciledByUserId: user.id },
        })
        await tx.expenseCategoryPattern.updateMany({
          where: { clinicId: user.clinicId, recurrenceId: candidate.recurrenceId },
          data: { matchCount: { increment: 1 } },
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

    return NextResponse.json({ autoReconciled, suggestions: enrichedSuggestions })
  }
)
