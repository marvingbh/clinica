import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { sumAmounts, AMOUNT_TOLERANCE } from "@/lib/bank-reconciliation"

const TX_TIMEOUT = 15000

const createSchema = z.object({
  creditTransactionId: z.string(),
  debitTransactionId: z.string(),
  amount: z.number().positive(),
})

/**
 * POST /api/financeiro/conciliacao/refund-links
 *
 * Pairs an overpayment CREDIT bank transaction with the outgoing refund
 * DEBIT that returned the difference to the payer. Both transactions
 * count as fully resolved after a successful link.
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      )
    }
    const { creditTransactionId, debitTransactionId, amount } = parsed.data

    if (creditTransactionId === debitTransactionId) {
      return NextResponse.json(
        { error: "As transações devem ser diferentes" },
        { status: 400 },
      )
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const [credit, debit] = await Promise.all([
          tx.bankTransaction.findFirst({
            where: { id: creditTransactionId, clinicId: user.clinicId },
            include: {
              reconciliationLinks: { select: { amount: true } },
              refundLinksAsCredit: { select: { amount: true } },
            },
          }),
          tx.bankTransaction.findFirst({
            where: { id: debitTransactionId, clinicId: user.clinicId },
            include: {
              expenseReconciliationLinks: { select: { amount: true } },
              refundLinksAsDebit: { select: { amount: true } },
            },
          }),
        ])

        if (!credit || !debit) {
          throw new Error("NOT_FOUND")
        }
        if (credit.type !== "CREDIT") {
          throw new Error("WRONG_CREDIT_TYPE")
        }
        if (debit.type !== "DEBIT") {
          throw new Error("WRONG_DEBIT_TYPE")
        }
        if (credit.dismissReason || debit.dismissReason) {
          throw new Error("DISMISSED")
        }

        const creditAmount = Number(credit.amount)
        const debitAmount = Number(debit.amount)
        const creditAllocated =
          sumAmounts(credit.reconciliationLinks) + sumAmounts(credit.refundLinksAsCredit)
        const debitAllocated =
          sumAmounts(debit.expenseReconciliationLinks) + sumAmounts(debit.refundLinksAsDebit)

        if (amount > creditAmount - creditAllocated + AMOUNT_TOLERANCE) {
          throw new Error("EXCEEDS_CREDIT")
        }
        if (amount > debitAmount - debitAllocated + AMOUNT_TOLERANCE) {
          throw new Error("EXCEEDS_DEBIT")
        }

        return tx.transactionRefundLink.create({
          data: {
            clinicId: user.clinicId,
            creditTransactionId,
            debitTransactionId,
            amount,
            linkedByUserId: user.id,
          },
        })
      }, { timeout: TX_TIMEOUT })

      audit
        .log({
          user,
          action: AuditAction.TRANSACTION_REFUND_LINK_CREATED,
          entityType: "TransactionRefundLink",
          entityId: created.id,
          newValues: { creditTransactionId, debitTransactionId, amount },
          request: req,
        })
        .catch(() => {})

      return NextResponse.json({ refundLink: created }, { status: 201 })
    } catch (err: unknown) {
      // Unique constraint (double-submit / concurrent create)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json(
          { error: "Devolução já registrada para este par de transações" },
          { status: 409 },
        )
      }
      const msg = err instanceof Error ? err.message : ""
      switch (msg) {
        case "NOT_FOUND":
          return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 })
        case "WRONG_CREDIT_TYPE":
          return NextResponse.json({ error: "A primeira transação deve ser do tipo CREDIT" }, { status: 400 })
        case "WRONG_DEBIT_TYPE":
          return NextResponse.json({ error: "A segunda transação deve ser do tipo DEBIT" }, { status: 400 })
        case "DISMISSED":
          return NextResponse.json({ error: "Transação dispensada — desfaça antes" }, { status: 400 })
        case "EXCEEDS_CREDIT":
          return NextResponse.json({ error: "Valor excede o restante do crédito" }, { status: 400 })
        case "EXCEEDS_DEBIT":
          return NextResponse.json({ error: "Valor excede o restante do débito" }, { status: 400 })
        default:
          throw err
      }
    }
  },
)

/**
 * DELETE /api/financeiro/conciliacao/refund-links?id=…
 * Undoes a refund link.
 */
export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    }

    const existing = await prisma.transactionRefundLink.findFirst({
      where: { id, clinicId: user.clinicId },
      select: {
        id: true,
        creditTransactionId: true,
        debitTransactionId: true,
        amount: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Devolução não encontrada" }, { status: 404 })
    }

    await prisma.transactionRefundLink.delete({ where: { id } })

    audit
      .log({
        user,
        action: AuditAction.TRANSACTION_REFUND_LINK_DELETED,
        entityType: "TransactionRefundLink",
        entityId: existing.id,
        oldValues: {
          creditTransactionId: existing.creditTransactionId,
          debitTransactionId: existing.debitTransactionId,
          amount: Number(existing.amount),
        },
        request: req,
      })
      .catch(() => {})

    return NextResponse.json({ message: "Devolução desfeita" })
  },
)
