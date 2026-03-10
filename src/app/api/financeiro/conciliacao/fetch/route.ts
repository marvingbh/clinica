import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { fetchStatements } from "@/lib/bank-reconciliation"
import type { InterConfig } from "@/lib/bank-reconciliation"

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const integration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
    })

    if (!integration) {
      return NextResponse.json(
        { error: "Integração bancária não configurada" },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const formatDate = (d: Date) => d.toISOString().split("T")[0]

    // Use provided dates or default to last 30 days
    const endDate = body.endDate ? new Date(body.endDate) : new Date()
    const startDate = body.startDate ? new Date(body.startDate) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Inter API max range is 90 days
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 90) {
      return NextResponse.json(
        { error: "Período máximo de 90 dias" },
        { status: 400 }
      )
    }

    const config: InterConfig = {
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      certificate: integration.certificate,
      privateKey: integration.privateKey,
    }

    // Inter API may treat boundary dates as exclusive — expand by 1 day each side
    const apiStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
    const apiEndDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)

    let transactions
    try {
      transactions = await fetchStatements(
        config,
        formatDate(apiStartDate),
        formatDate(apiEndDate)
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao conectar com o banco"
      return NextResponse.json({ error: message }, { status: 502 })
    }

    // Filter to the exact requested range and only CREDIT transactions
    const startStr = formatDate(startDate)
    const endStr = formatDate(endDate)
    const credits = transactions.filter(
      (tx) => tx.type === "CREDIT" && tx.date >= startStr && tx.date <= endStr
    )

    // Delete all non-reconciled transactions before importing fresh data
    await prisma.bankTransaction.deleteMany({
      where: {
        clinicId: user.clinicId,
        reconciliationLinks: { none: {} },
      },
    })

    // Migrate reconciled records with old externalId format (index-based)
    const reconciledInRange = await prisma.bankTransaction.findMany({
      where: {
        clinicId: user.clinicId,
        reconciliationLinks: { some: {} },
        date: { gte: startDate, lte: endDate },
      },
      select: { id: true, date: true, amount: true, description: true },
    })
    const reconciledLookup = new Map<string, string>()
    for (const rec of reconciledInRange) {
      const key = `${rec.date.toISOString().split("T")[0]}|${Number(rec.amount)}|${rec.description}`
      reconciledLookup.set(key, rec.id)
    }

    let newCount = 0
    for (const tx of credits) {
      // Check if a reconciled record exists with old externalId for same content
      const contentKey = `${tx.date}|${tx.amount}|${tx.description}`
      const existingReconciledId = reconciledLookup.get(contentKey)

      if (existingReconciledId) {
        await prisma.bankTransaction.update({
          where: { id: existingReconciledId },
          data: { externalId: tx.externalId },
        })
        reconciledLookup.delete(contentKey)
        continue
      }

      const result = await prisma.bankTransaction.upsert({
        where: {
          clinicId_externalId: {
            clinicId: user.clinicId,
            externalId: tx.externalId,
          },
        },
        update: {
          date: new Date(tx.date),
          amount: tx.amount,
          description: tx.description,
          payerName: tx.payerName,
        },
        create: {
          clinicId: user.clinicId,
          bankIntegrationId: integration.id,
          externalId: tx.externalId,
          date: new Date(tx.date),
          amount: tx.amount,
          description: tx.description,
          payerName: tx.payerName,
          type: tx.type,
        },
      })
      newCount++
    }

    return NextResponse.json({
      fetched: credits.length,
      newTransactions: newCount,
      period: {
        start: formatDate(startDate),
        end: formatDate(endDate),
      },
    })
  }
)
