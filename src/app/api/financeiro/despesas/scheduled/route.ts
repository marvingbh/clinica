import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { fetchScheduledPayments } from "@/lib/bank-reconciliation"
import { normalizeDescription, suggestCategory } from "@/lib/expense-matcher"
import type { InterConfig } from "@/lib/bank-reconciliation"
import type { StoredPattern } from "@/lib/expense-matcher"

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
      const message = err instanceof Error ? err.message : "Erro ao buscar pagamentos agendados"
      return NextResponse.json({ error: message }, { status: 502 })
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
    const payments: {
      codigoTransacao: string
      dataVencimento: string
      valor: number
      descricao: string
      categoryId?: string | null
      supplierName?: string | null
    }[] = body.payments ?? []

    if (payments.length === 0) {
      return NextResponse.json({ error: "Nenhum pagamento selecionado" }, { status: 400 })
    }

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
      const normalized = normalizeDescription(p.descricao)
      if (normalized && (p.categoryId || p.supplierName)) {
        await prisma.expenseCategoryPattern.upsert({
          where: {
            clinicId_normalizedDescription: {
              clinicId: user.clinicId,
              normalizedDescription: normalized,
            },
          },
          update: {
            categoryId: p.categoryId ?? undefined,
            supplierName: p.supplierName ?? undefined,
            matchCount: { increment: 1 },
          },
          create: {
            clinicId: user.clinicId,
            normalizedDescription: normalized,
            categoryId: p.categoryId ?? null,
            supplierName: p.supplierName ?? null,
            matchCount: 1,
          },
        })
      }

      created++
    }

    return NextResponse.json({ created })
  }
)
