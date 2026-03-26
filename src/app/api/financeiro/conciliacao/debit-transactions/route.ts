import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { suggestCategory } from "@/lib/expense-matcher"
import type { StoredPattern } from "@/lib/expense-matcher"

export const GET = withFeatureAuth(
  { feature: "expenses", minAccess: "READ" },
  async (req, { user }) => {
    // Fetch DEBIT transactions not yet matched to expenses
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        clinicId: user.clinicId,
        type: "DEBIT",
        expenseReconciliationLinks: { none: {} },
        dismissReason: null,
      },
      orderBy: { date: "desc" },
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

    const withSuggestions = transactions.map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
      suggestion: suggestCategory(tx.description, storedPatterns),
    }))

    return NextResponse.json(withSuggestions)
  }
)
