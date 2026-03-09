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

    // Last 30 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const formatDate = (d: Date) => d.toISOString().split("T")[0]

    const config: InterConfig = {
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      certificate: integration.certificate,
      privateKey: integration.privateKey,
    }

    let transactions
    try {
      transactions = await fetchStatements(
        config,
        formatDate(startDate),
        formatDate(endDate)
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao conectar com o banco"
      return NextResponse.json({ error: message }, { status: 502 })
    }

    // Only store CREDIT transactions (payments received)
    const credits = transactions.filter((tx) => tx.type === "CREDIT")

    // Upsert: skip duplicates via externalId
    let newCount = 0
    for (const tx of credits) {
      const existing = await prisma.bankTransaction.findUnique({
        where: {
          clinicId_externalId: {
            clinicId: user.clinicId,
            externalId: tx.externalId,
          },
        },
      })

      if (!existing) {
        await prisma.bankTransaction.create({
          data: {
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
