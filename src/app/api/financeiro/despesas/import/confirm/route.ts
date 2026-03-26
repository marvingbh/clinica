import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { normalizeDescription } from "@/lib/expense-matcher"

const confirmSchema = z.object({
  transactions: z.array(z.object({
    externalId: z.string(),
    date: z.string(),
    amount: z.number().positive(),
    description: z.string(),
    categoryId: z.string().nullable().optional(),
    supplierName: z.string().nullable().optional(),
  })),
})

export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = confirmSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    let created = 0
    let patternsUpserted = 0

    await prisma.$transaction(async (tx) => {
      for (const item of parsed.data.transactions) {
        // Create or find bank transaction
        const bankTx = await tx.bankTransaction.upsert({
          where: {
            clinicId_externalId: {
              clinicId: user.clinicId,
              externalId: item.externalId,
            },
          },
          update: {},
          create: {
            clinicId: user.clinicId,
            bankIntegrationId: "", // Imported via file, not API
            externalId: item.externalId,
            date: new Date(item.date),
            amount: item.amount,
            description: item.description,
            type: "DEBIT",
          },
        })

        // Create expense
        const expense = await tx.expense.create({
          data: {
            clinicId: user.clinicId,
            description: item.description,
            supplierName: item.supplierName ?? null,
            categoryId: item.categoryId ?? null,
            amount: item.amount,
            dueDate: new Date(item.date),
            status: "PAID",
            paidAt: new Date(item.date),
            createdByUserId: user.id,
          },
        })

        // Link expense to bank transaction
        await tx.expenseReconciliationLink.create({
          data: {
            clinicId: user.clinicId,
            transactionId: bankTx.id,
            expenseId: expense.id,
            amount: item.amount,
            reconciledByUserId: user.id,
          },
        })

        created++

        // Upsert pattern for future matching
        if (item.categoryId || item.supplierName) {
          const normalized = normalizeDescription(item.description)
          if (normalized) {
            await tx.expenseCategoryPattern.upsert({
              where: {
                clinicId_normalizedDescription: {
                  clinicId: user.clinicId,
                  normalizedDescription: normalized,
                },
              },
              update: {
                categoryId: item.categoryId ?? undefined,
                supplierName: item.supplierName ?? undefined,
                matchCount: { increment: 1 },
              },
              create: {
                clinicId: user.clinicId,
                normalizedDescription: normalized,
                categoryId: item.categoryId ?? null,
                supplierName: item.supplierName ?? null,
                matchCount: 1,
              },
            })
            patternsUpserted++
          }
        }
      }
    })

    return NextResponse.json({ created, patternsUpserted })
  }
)
