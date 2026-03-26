import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { upsertCategoryPattern } from "@/lib/expense-matcher"

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
        // Create expense directly (file imports don't create bank transactions)
        await tx.expense.create({
          data: {
            clinicId: user.clinicId,
            description: item.description,
            supplierName: item.supplierName ?? null,
            categoryId: item.categoryId ?? null,
            amount: item.amount,
            dueDate: new Date(item.date),
            status: "PAID",
            paidAt: new Date(item.date),
            notes: `Importado de arquivo - Ref: ${item.externalId}`,
            createdByUserId: user.id,
          },
        })

        created++

        // Upsert pattern for future matching
        if (item.categoryId || item.supplierName) {
          await upsertCategoryPattern(tx, user.clinicId, item.description, item.categoryId, item.supplierName)
          patternsUpserted++
        }
      }
    })

    return NextResponse.json({ created, patternsUpserted })
  }
)
