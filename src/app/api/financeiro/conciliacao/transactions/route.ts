import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { matchTransactions } from "@/lib/bank-reconciliation"
import type {
  TransactionForMatching,
  InvoiceForMatching,
} from "@/lib/bank-reconciliation"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const showReconciled = searchParams.get("showReconciled") === "true"

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      type: "CREDIT",
    }
    if (!showReconciled) {
      where.reconciledInvoiceId = null
    }

    const [transactions, invoices] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { date: "desc" },
        take: 200,
      }),
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["PENDENTE", "ENVIADO"] },
        },
        select: {
          id: true,
          patientId: true,
          totalAmount: true,
          referenceMonth: true,
          referenceYear: true,
          status: true,
          patient: {
            select: {
              name: true,
              motherName: true,
              fatherName: true,
            },
          },
        },
      }),
    ])

    // Map to domain types
    const txForMatching: TransactionForMatching[] = transactions
      .filter((tx) => tx.reconciledInvoiceId === null)
      .map((tx) => ({
        id: tx.id,
        date: tx.date,
        amount: Number(tx.amount),
        description: tx.description,
        payerName: tx.payerName,
      }))

    const invForMatching: InvoiceForMatching[] = invoices.map((inv) => ({
      id: inv.id,
      patientId: inv.patientId,
      patientName: inv.patient.name,
      motherName: inv.patient.motherName,
      fatherName: inv.patient.fatherName,
      totalAmount: Number(inv.totalAmount),
      referenceMonth: inv.referenceMonth,
      referenceYear: inv.referenceYear,
      status: inv.status,
    }))

    const matchResults = matchTransactions(txForMatching, invForMatching)

    // Build response
    const response = transactions.map((tx) => {
      const match = matchResults.find((m) => m.transaction.id === tx.id)
      return {
        id: tx.id,
        externalId: tx.externalId,
        date: tx.date,
        amount: Number(tx.amount),
        description: tx.description,
        payerName: tx.payerName,
        reconciledInvoiceId: tx.reconciledInvoiceId,
        reconciledAt: tx.reconciledAt,
        candidates:
          match?.candidates.map((c) => ({
            invoiceId: c.invoice.id,
            patientName: c.invoice.patientName,
            motherName: c.invoice.motherName,
            fatherName: c.invoice.fatherName,
            totalAmount: c.invoice.totalAmount,
            referenceMonth: c.invoice.referenceMonth,
            referenceYear: c.invoice.referenceYear,
            confidence: c.confidence,
            nameScore: c.nameScore,
            matchedField: c.matchedField,
          })) || [],
      }
    })

    return NextResponse.json({ transactions: response })
  }
)
