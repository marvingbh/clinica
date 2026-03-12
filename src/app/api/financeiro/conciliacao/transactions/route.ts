import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  matchTransactions,
  normalizeForComparison,
  findGroupCandidates,
  findSamePatientGroups,
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
  remainingAmount: inv.remainingAmount,
  referenceMonth: inv.referenceMonth,
  referenceYear: inv.referenceYear,
  status: inv.status,
})

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const showReconciled = searchParams.get("showReconciled") === "true"
    const showDismissed = searchParams.get("showDismissed") === "true"

    const [transactions, invoices, usualPayers] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          clinicId: user.clinicId,
          type: "CREDIT",
          dismissReason: null,
        },
        orderBy: { date: "desc" },
        take: 200,
        include: {
          reconciliationLinks: {
            include: {
              invoice: {
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
          },
        },
      }),
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          OR: [
            { status: { in: ["PENDENTE", "ENVIADO", "PARCIAL"] } },
            { status: "PAGO", reconciliationLinks: { none: {} } },
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
          reconciliationLinks: {
            select: { amount: true },
          },
        },
      }),
      prisma.patientUsualPayer.findMany({
        where: { clinicId: user.clinicId },
        select: { payerName: true, patientId: true },
      }),
    ])

    // Pre-compute allocated amounts per transaction (used for matching and response)
    const txAllocatedMap = new Map<string, number>()
    for (const tx of transactions) {
      const allocated = tx.reconciliationLinks.reduce((sum, l) => sum + Number(l.amount), 0)
      txAllocatedMap.set(tx.id, allocated)
    }

    const txForMatching: TransactionForMatching[] = transactions
      .filter((tx) => Number(tx.amount) - txAllocatedMap.get(tx.id)! >= 0.01)
      .map((tx) => ({
        id: tx.id,
        date: tx.date,
        amount: Number(tx.amount) - txAllocatedMap.get(tx.id)!,
        description: tx.description,
        payerName: tx.payerName,
      }))

    const invForMatching: InvoiceForMatching[] = invoices.map((inv) => {
      const paidAmount = inv.reconciliationLinks.reduce(
        (sum, link) => sum + Number(link.amount),
        0
      )
      return {
        id: inv.id,
        patientId: inv.patientId,
        patientName: inv.patient.name,
        motherName: inv.patient.motherName,
        fatherName: inv.patient.fatherName,
        totalAmount: Number(inv.totalAmount),
        remainingAmount: Number(inv.totalAmount) - paidAmount,
        referenceMonth: inv.referenceMonth,
        referenceYear: inv.referenceYear,
        status: inv.status,
      }
    })

    const invWithParent: InvoiceWithParent[] = invForMatching.map((inv) => ({
      ...inv,
      normalizedMother: normalizeForComparison(inv.motherName),
      normalizedFather: normalizeForComparison(inv.fatherName),
    }))

    // Build usual payers lookup: normalizedPayerName → Set<patientId>
    const usualPayersMap = new Map<string, Set<string>>()
    for (const up of usualPayers) {
      const existing = usualPayersMap.get(up.payerName)
      if (existing) {
        existing.add(up.patientId)
      } else {
        usualPayersMap.set(up.payerName, new Set([up.patientId]))
      }
    }

    const matchResults = matchTransactions(txForMatching, invForMatching, usualPayersMap)

    const response = transactions.map((tx) => {
      const allocatedAmount = txAllocatedMap.get(tx.id)!
      const txAmount = Number(tx.amount)
      const remainingAmount = txAmount - allocatedAmount
      const isFullyReconciled = remainingAmount < 0.01

      const match = matchResults.find((m) => m.transaction.id === tx.id)
      const txDate = new Date(tx.date)
      const txMonth = txDate.getMonth() + 1
      const txYear = txDate.getFullYear()

      const sameMonthCandidates =
        match?.candidates.filter(
          (c) =>
            c.invoice.referenceMonth === txMonth &&
            c.invoice.referenceYear === txYear
        ) || []

      const sameMonthInvWithParent = invWithParent.filter(
        (inv) =>
          inv.referenceMonth === txMonth && inv.referenceYear === txYear
      )
      const siblingGroups = !isFullyReconciled
        ? findGroupCandidates(
            remainingAmount,
            tx.payerName,
            sameMonthInvWithParent
          )
        : []
      const patientGroups = !isFullyReconciled
        ? findSamePatientGroups(
            remainingAmount,
            tx.payerName,
            sameMonthInvWithParent
          )
        : []
      const groups = [...siblingGroups, ...patientGroups]

      return {
        id: tx.id,
        externalId: tx.externalId,
        date: tx.date,
        amount: txAmount,
        description: tx.description,
        payerName: tx.payerName,
        allocatedAmount,
        remainingAmount,
        isFullyReconciled,
        links: tx.reconciliationLinks.map((link) => ({
          linkId: link.id,
          invoiceId: link.invoice.id,
          patientName: link.invoice.patient.name,
          amount: Number(link.amount),
          totalAmount: Number(link.invoice.totalAmount),
          referenceMonth: link.invoice.referenceMonth,
          referenceYear: link.invoice.referenceYear,
          status: link.invoice.status,
        })),
        candidates: !isFullyReconciled
          ? sameMonthCandidates.map((c) => ({
              ...mapInvoice(c.invoice),
              confidence: c.confidence,
              nameScore: c.nameScore,
              matchedField: c.matchedField,
            }))
          : [],
        groupCandidates: !isFullyReconciled
          ? groups.map((g) => ({
              invoices: g.invoices.map(mapInvoice),
              sharedParent: g.sharedParent,
            }))
          : [],
      }
    })

    const filteredResponse = showReconciled
      ? response
      : response.filter((tx) => !tx.isFullyReconciled)

    const dismissedTransactions = showDismissed
      ? await prisma.bankTransaction.findMany({
          where: {
            clinicId: user.clinicId,
            type: "CREDIT",
            dismissReason: { not: null },
          },
          orderBy: { date: "desc" },
          select: {
            id: true,
            externalId: true,
            date: true,
            amount: true,
            description: true,
            payerName: true,
            dismissReason: true,
            dismissedAt: true,
          },
        })
      : []

    return NextResponse.json({
      transactions: filteredResponse,
      ...(showDismissed && dismissedTransactions.length > 0
        ? { dismissedTransactions: dismissedTransactions.map((t) => ({
            ...t,
            amount: Number(t.amount),
          })) }
        : {}),
    })
  }
)
