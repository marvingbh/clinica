import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { isValidTransition } from "@/lib/expenses"
import { normalizeDescription } from "@/lib/expense-matcher"

const matchSchema = z.object({
  transactionId: z.string(),
  expenseId: z.string(),
})

export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = matchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const { transactionId, expenseId } = parsed.data

    const [transaction, expense] = await Promise.all([
      prisma.bankTransaction.findFirst({
        where: { id: transactionId, clinicId: user.clinicId, type: "DEBIT" },
      }),
      prisma.expense.findFirst({
        where: { id: expenseId, clinicId: user.clinicId },
      }),
    ])

    if (!transaction) {
      return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 })
    }
    if (!expense) {
      return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      // Create reconciliation link
      await tx.expenseReconciliationLink.create({
        data: {
          clinicId: user.clinicId,
          transactionId,
          expenseId,
          amount: transaction.amount,
          reconciledByUserId: user.id,
        },
      })

      // Mark expense as paid if it's open/overdue
      if (isValidTransition(expense.status, "PAID")) {
        await tx.expense.update({
          where: { id: expenseId },
          data: { status: "PAID", paidAt: transaction.date },
        })
      }

      // Upsert pattern for future matching
      if (expense.categoryId) {
        const normalized = normalizeDescription(transaction.description)
        if (normalized) {
          await tx.expenseCategoryPattern.upsert({
            where: {
              clinicId_normalizedDescription: {
                clinicId: user.clinicId,
                normalizedDescription: normalized,
              },
            },
            update: {
              categoryId: expense.categoryId,
              supplierName: expense.supplierName ?? undefined,
              matchCount: { increment: 1 },
            },
            create: {
              clinicId: user.clinicId,
              normalizedDescription: normalized,
              categoryId: expense.categoryId,
              supplierName: expense.supplierName ?? null,
              matchCount: 1,
            },
          })
        }
      }
    })

    return NextResponse.json({ success: true })
  }
)
