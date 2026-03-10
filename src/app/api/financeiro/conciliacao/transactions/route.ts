import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  matchTransactions,
  normalizeForComparison,
  findGroupCandidates,
} from "@/lib/bank-reconciliation"
import type {
  TransactionForMatching,
  InvoiceForMatching,
  InvoiceWithParent,
} from "@/lib/bank-reconciliation"

const mapInvoice = (inv: InvoiceForMatching) => ({
  invoiceId: inv.id,
  patientName: inv.patientName,
  motherName: inv.motherName,
  fatherName: inv.fatherName,
  totalAmount: inv.totalAmount,
  referenceMonth: inv.referenceMonth,
  referenceYear: inv.referenceYear,
  status: inv.status,
})

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
        include: {
          reconciledInvoice: {
            select: {
              id: true,
              totalAmount: true,
              referenceMonth: true,
              referenceYear: true,
              status: true,
              patient: { select: { name: true } },
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          OR: [
            { status: { in: ["PENDENTE", "ENVIADO"] } },
            { status: "PAGO", bankTransactions: { none: {} } },
          ],
        },
        select: {
          id: true,
          patientId: true,
          totalAmount: true,
          referenceMonth: true,
          referenceYear: true,
          status: true,
          patient: {
            select: { name: true, motherName: true, fatherName: true },
          },
        },
      }),
    ])

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

    const invWithParent: InvoiceWithParent[] = invForMatching.map((inv) => ({
      ...inv,
      normalizedMother: normalizeForComparison(inv.motherName),
      normalizedFather: normalizeForComparison(inv.fatherName),
    }))

    const matchResults = matchTransactions(txForMatching, invForMatching)

    const response = transactions.map((tx) => {
      const match = matchResults.find((m) => m.transaction.id === tx.id)
      const txAmount = Number(tx.amount)
      const txDate = new Date(tx.date)
      const txMonth = txDate.getMonth() + 1
      const txYear = txDate.getFullYear()

      const sameMonthCandidates = match?.candidates.filter(
        (c) => c.invoice.referenceMonth === txMonth && c.invoice.referenceYear === txYear
      ) || []

      const sameMonthInvWithParent = invWithParent.filter(
        (inv) => inv.referenceMonth === txMonth && inv.referenceYear === txYear
      )
      const groups = tx.reconciledInvoiceId === null
        ? findGroupCandidates(txAmount, tx.payerName, sameMonthInvWithParent)
        : []

      const reconciledInvoice = tx.reconciledInvoice ? {
        invoiceId: tx.reconciledInvoice.id,
        patientName: tx.reconciledInvoice.patient.name,
        totalAmount: Number(tx.reconciledInvoice.totalAmount),
        referenceMonth: tx.reconciledInvoice.referenceMonth,
        referenceYear: tx.reconciledInvoice.referenceYear,
        status: tx.reconciledInvoice.status,
      } : null

      return {
        id: tx.id,
        externalId: tx.externalId,
        date: tx.date,
        amount: txAmount,
        description: tx.description,
        payerName: tx.payerName,
        reconciledInvoiceId: tx.reconciledInvoiceId,
        reconciledAt: tx.reconciledAt,
        reconciledInvoice,
        candidates: sameMonthCandidates.map((c) => ({
          ...mapInvoice(c.invoice),
          confidence: c.confidence,
          nameScore: c.nameScore,
          matchedField: c.matchedField,
        })),
        groupCandidates: groups.map((g) => ({
          invoices: g.invoices.map(mapInvoice),
          sharedParent: g.sharedParent,
        })),
      }
    })

    return NextResponse.json({ transactions: response })
  }
)
