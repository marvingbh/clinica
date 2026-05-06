import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { suggestCategory } from "@/lib/expense-matcher"
import type { StoredPattern } from "@/lib/expense-matcher"

export const GET = withFeatureAuth(
  { feature: "expenses", minAccess: "READ" },
  async (req, { user }) => {
    // Fetch DEBIT transactions not yet matched to expenses. Refund-linked
    // debits stay visible until *fully* refunded — partial refund still
    // leaves a remainder for an expense match.
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        clinicId: user.clinicId,
        type: "DEBIT",
        expenseReconciliationLinks: { none: {} },
        dismissReason: null,
      },
      orderBy: { date: "desc" },
      include: {
        refundLinksAsDebit: {
          select: {
            id: true,
            amount: true,
            linkedAt: true,
            creditTransaction: {
              select: { id: true, date: true, amount: true, payerName: true, description: true },
            },
          },
        },
      },
    })

    // Load patterns for suggestions
    const patterns = await prisma.expenseCategoryPattern.findMany({
      where: { clinicId: user.clinicId },
      include: { category: { select: { name: true } } },
    })

    const storedPatterns: StoredPattern[] = patterns.map((p) => ({
      normalizedDescription: p.normalizedDescription,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      supplierName: p.supplierName,
      matchCount: p.matchCount,
    }))

    const withSuggestions = transactions
      .map((tx) => {
        const refundedAmount = tx.refundLinksAsDebit.reduce(
          (sum, l) => sum + Number(l.amount),
          0,
        )
        const txAmount = Number(tx.amount)
        const remainingAmount = txAmount - refundedAmount
        return {
          ...tx,
          amount: txAmount,
          refundedAmount,
          remainingAmount,
          isFullyRefunded: remainingAmount < 0.01,
          refundLinks: tx.refundLinksAsDebit.map((link) => ({
            id: link.id,
            amount: Number(link.amount),
            linkedAt: link.linkedAt,
            credit: {
              id: link.creditTransaction.id,
              date: link.creditTransaction.date,
              amount: Number(link.creditTransaction.amount),
              payerName: link.creditTransaction.payerName,
              description: link.creditTransaction.description,
            },
          })),
          suggestion: suggestCategory(tx.description, storedPatterns),
        }
      })
      // Drop debits fully refunded — they belong to the refund flow, not the expense queue
      .filter((tx) => !tx.isFullyRefunded)

    return NextResponse.json(withSuggestions)
  },
)
