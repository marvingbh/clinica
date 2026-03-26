import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { fetchScheduledPayments } from "@/lib/bank-reconciliation"
import { suggestCategory, upsertCategoryPattern } from "@/lib/expense-matcher"
import type { InterConfig } from "@/lib/bank-reconciliation"
import type { StoredPattern } from "@/lib/expense-matcher"

const importSchema = z.object({
  payments: z.array(z.object({
    codigoTransacao: z.string().min(1),
    dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    valor: z.number().positive(),
    descricao: z.string().min(1).max(500),
    categoryId: z.string().nullable().optional(),
    supplierName: z.string().nullable().optional(),
  })).min(1),
})

/**
 * GET /api/financeiro/despesas/scheduled
 * Fetch scheduled (AGENDADO) payments from Inter and return them
 * with category suggestions. Does NOT create expenses automatically.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const integration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
    })

    if (!integration) {
      return NextResponse.json({ error: "Integração bancária não configurada" }, { status: 400 })
    }

    const config: InterConfig = {
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      certificate: integration.certificate,
      privateKey: integration.privateKey,
    }

    // Fetch scheduled payments for the next 90 days
    const today = new Date()
    const futureDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    const formatDate = (d: Date) => d.toISOString().split("T")[0]

    let payments
    try {
      payments = await fetchScheduledPayments(config, formatDate(today), formatDate(futureDate))
    } catch (err) {
      // Scheduled payments endpoint may not be available for all Inter accounts
      // Return empty list instead of error so the UI degrades gracefully
      return NextResponse.json({
        payments: [],
        total: 0,
        alreadyImported: 0,
        pending: 0,
        unavailable: true,
        reason: err instanceof Error ? err.message : "Endpoint não disponível",
      })
    }

    // Check which ones already have matching expenses (by amount + date proximity)
    const existingExpenses = await prisma.expense.findMany({
      where: {
        clinicId: user.clinicId,
        status: { in: ["OPEN", "DRAFT"] },
        dueDate: { gte: today, lte: futureDate },
      },
      select: { id: true, amount: true, dueDate: true, description: true },
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

    const enriched = payments.map((p) => {
      // Check if an expense already exists for this scheduled payment
      const matchingExpense = existingExpenses.find((e) => {
        const amountMatch = Math.abs(Number(e.amount) - p.valor) < 0.01
        const dateDiff = Math.abs(e.dueDate.getTime() - new Date(p.dataVencimento).getTime()) / (1000 * 60 * 60 * 24)
        return amountMatch && dateDiff <= 3
      })

      return {
        ...p,
        suggestion: suggestCategory(p.descricao, storedPatterns),
        alreadyImported: !!matchingExpense,
        matchingExpenseId: matchingExpense?.id ?? null,
      }
    })

    return NextResponse.json({
      payments: enriched,
      total: enriched.length,
      alreadyImported: enriched.filter((p) => p.alreadyImported).length,
      pending: enriched.filter((p) => !p.alreadyImported).length,
    })
  }
)

/**
 * POST /api/financeiro/despesas/scheduled
 * Import selected scheduled payments as OPEN expenses.
 */
export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = importSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const payments = parsed.data.payments

    let created = 0
    for (const p of payments) {
      await prisma.expense.create({
        data: {
          clinicId: user.clinicId,
          description: p.descricao,
          supplierName: p.supplierName ?? null,
          categoryId: p.categoryId ?? null,
          amount: p.valor,
          dueDate: new Date(p.dataVencimento),
          status: "OPEN",
          notes: `Importado do Inter - Agendamento ${p.codigoTransacao}`,
          createdByUserId: user.id,
        },
      })

      // Learn pattern
      if (p.categoryId || p.supplierName) {
        await upsertCategoryPattern(prisma, user.clinicId, p.descricao, p.categoryId, p.supplierName)
      }

      created++
    }

    return NextResponse.json({ created })
  }
)
