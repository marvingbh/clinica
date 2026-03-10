import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { matchTransactions, normalizeForComparison } from "@/lib/bank-reconciliation"
import type {
  TransactionForMatching,
  InvoiceForMatching,
} from "@/lib/bank-reconciliation"

interface InvoiceWithParent extends InvoiceForMatching {
  normalizedMother: string
  normalizedFather: string
}

/**
 * Find pairs (or triples) of invoices from the same family that sum to the transaction amount.
 * Prioritizes pairs (2 invoices) over triples.
 */
function findGroupCandidates(
  txAmount: number,
  txPayerName: string | null,
  allInvoices: InvoiceWithParent[]
) {
  const groups: Array<{
    invoices: InvoiceWithParent[]
    sharedParent: string | null
  }> = []

  const payerWords = txPayerName
    ? normalizeForComparison(txPayerName).split(" ").filter(w => w.length > 2)
    : []

  // Find pairs
  for (let i = 0; i < allInvoices.length; i++) {
    for (let j = i + 1; j < allInvoices.length; j++) {
      const a = allInvoices[i]
      const b = allInvoices[j]
      if (Math.abs(a.totalAmount + b.totalAmount - txAmount) >= 0.01) continue

      // Check shared parent
      const shared = getSharedParent(a, b)
      if (!shared) continue

      // Check if payer name relates to the shared parent
      if (payerWords.length > 0) {
        const parentWords = normalizeForComparison(shared).split(" ").filter(w => w.length > 2)
        const hasOverlap = parentWords.some(w => payerWords.includes(w))
        if (!hasOverlap) continue
      }

      groups.push({ invoices: [a, b], sharedParent: shared })
    }
  }

  return groups
}

function getSharedParent(a: InvoiceWithParent, b: InvoiceWithParent): string | null {
  if (a.normalizedMother && a.normalizedMother === b.normalizedMother) return a.motherName
  if (a.normalizedFather && a.normalizedFather === b.normalizedFather) return a.fatherName
  if (a.normalizedMother && a.normalizedMother === b.normalizedFather) return a.motherName
  if (a.normalizedFather && a.normalizedFather === b.normalizedMother) return a.fatherName
  return null
}

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
            // Include manually-paid invoices not yet linked to a bank transaction
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

    const invWithParent: InvoiceWithParent[] = invForMatching.map((inv) => ({
      ...inv,
      normalizedMother: normalizeForComparison(inv.motherName),
      normalizedFather: normalizeForComparison(inv.fatherName),
    }))

    const matchResults = matchTransactions(txForMatching, invForMatching)

    // Build response
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

    const response = transactions.map((tx) => {
      const match = matchResults.find((m) => m.transaction.id === tx.id)
      const txAmount = Number(tx.amount)
      const txDate = new Date(tx.date)
      const txMonth = txDate.getMonth() + 1
      const txYear = txDate.getFullYear()

      // Auto-suggestions: only show invoices from the same month as the transaction
      const sameMonthCandidates = match?.candidates.filter(
        (c) => c.invoice.referenceMonth === txMonth && c.invoice.referenceYear === txYear
      ) || []

      // Find group candidates filtered to same month
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
