import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  computeRemainingAmount,
  sumAmounts,
  rankRefundCandidates,
  CANDIDATE_WINDOW_DAYS,
} from "@/lib/bank-reconciliation"

/**
 * GET /api/financeiro/conciliacao/refund-candidates?creditTransactionId=…
 * GET /api/financeiro/conciliacao/refund-candidates?debitTransactionId=…
 *
 * Returns candidate transactions of the opposite type that could match
 * the refund of an overpayment. Candidates are unreconciled (not
 * dismissed, not already linked to this source) within a ±N-day window
 * around the source's date. Ranked by amount/name/date proximity.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const sp = new URL(req.url).searchParams
    const creditId = sp.get("creditTransactionId")
    const debitId = sp.get("debitTransactionId")

    if ((!creditId && !debitId) || (creditId && debitId)) {
      return NextResponse.json(
        { error: "Forneça creditTransactionId OU debitTransactionId" },
        { status: 400 },
      )
    }
    const sourceId = (creditId ?? debitId) as string
    const sourceType: "CREDIT" | "DEBIT" = creditId ? "CREDIT" : "DEBIT"
    const candidateType: "CREDIT" | "DEBIT" = sourceType === "CREDIT" ? "DEBIT" : "CREDIT"

    const source = await prisma.bankTransaction.findFirst({
      where: { id: sourceId, clinicId: user.clinicId, type: sourceType },
      include: {
        reconciliationLinks: { select: { amount: true, invoice: { select: { patient: { select: { name: true, motherName: true, fatherName: true } } } } } },
        refundLinksAsCredit: { select: { amount: true } },
        expenseReconciliationLinks: { select: { amount: true } },
        refundLinksAsDebit: { select: { amount: true } },
      },
    })

    if (!source) {
      return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 })
    }
    if (source.dismissReason) {
      return NextResponse.json({ error: "Transação dispensada" }, { status: 400 })
    }

    const reconciledTotal =
      sourceType === "CREDIT"
        ? sumAmounts(source.reconciliationLinks)
        : sumAmounts(source.expenseReconciliationLinks)
    const refundedTotal =
      sourceType === "CREDIT"
        ? sumAmounts(source.refundLinksAsCredit)
        : sumAmounts(source.refundLinksAsDebit)

    const remainingAmount = computeRemainingAmount(
      Number(source.amount),
      reconciledTotal,
      refundedTotal,
    )
    if (remainingAmount === 0) {
      return NextResponse.json({ candidates: [], remainingAmount: 0, windowDays: CANDIDATE_WINDOW_DAYS })
    }

    // Names tied to the source via reconciliation — used to widen the
    // name-match net (e.g. refund went out to a guardian whose name
    // differs from the original payer text).
    const relatedNames: string[] = []
    if (sourceType === "CREDIT") {
      for (const link of source.reconciliationLinks) {
        const p = link.invoice?.patient
        if (p?.name) relatedNames.push(p.name)
        if (p?.motherName) relatedNames.push(p.motherName)
        if (p?.fatherName) relatedNames.push(p.fatherName)
      }
    }

    // Window: ±14 days around the source's date.
    const windowMs = CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const windowStart = new Date(source.date.getTime() - windowMs)
    const windowEnd = new Date(source.date.getTime() + windowMs)

    // Find candidates: opposite type, same clinic, not dismissed, has remaining
    // amount (we'll filter post-fetch), not already linked to this source.
    const rawCandidates = await prisma.bankTransaction.findMany({
      where: {
        clinicId: user.clinicId,
        type: candidateType,
        dismissReason: null,
        date: { gte: windowStart, lte: windowEnd },
        // Exclude candidates that are already linked to this source.
        NOT:
          sourceType === "CREDIT"
            ? { refundLinksAsDebit: { some: { creditTransactionId: source.id } } }
            : { refundLinksAsCredit: { some: { debitTransactionId: source.id } } },
      },
      include: {
        reconciliationLinks: { select: { amount: true } },
        refundLinksAsCredit: { select: { amount: true } },
        expenseReconciliationLinks: { select: { amount: true } },
        refundLinksAsDebit: { select: { amount: true } },
      },
      orderBy: { date: "desc" },
      take: 100,
    })

    // Filter to candidates that still have remaining amount.
    const candidates = rawCandidates
      .map((c) => {
        const cReconciled =
          c.type === "CREDIT"
            ? sumAmounts(c.reconciliationLinks)
            : sumAmounts(c.expenseReconciliationLinks)
        const cRefunded =
          c.type === "CREDIT" ? sumAmounts(c.refundLinksAsCredit) : sumAmounts(c.refundLinksAsDebit)
        const cRemaining = computeRemainingAmount(Number(c.amount), cReconciled, cRefunded)
        return { c, cRemaining }
      })
      .filter(({ cRemaining }) => cRemaining > 0)

    const ranked = rankRefundCandidates({
      remainingAmount,
      sourcePayerName: source.payerName,
      relatedNames,
      sourceDate: source.date,
      candidates: candidates.map(({ c, cRemaining }) => ({
        id: c.id,
        amount: cRemaining,
        date: c.date,
        payerName: c.payerName,
        description: c.description,
      })),
    })

    // Hydrate the ranked output with the candidate row fields so the UI
    // can render without an extra round-trip.
    const candidateMap = new Map(candidates.map(({ c, cRemaining }) => [c.id, { c, cRemaining }]))
    const out = ranked
      .map(({ id, score, reasons }) => {
        const found = candidateMap.get(id)
        if (!found) return null
        return {
          id,
          score,
          reasons,
          amount: Number(found.c.amount),
          remainingAmount: found.cRemaining,
          date: found.c.date,
          payerName: found.c.payerName,
          description: found.c.description,
        }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)

    return NextResponse.json({
      candidates: out,
      remainingAmount,
      windowDays: CANDIDATE_WINDOW_DAYS,
      sourceType,
    })
  },
)
