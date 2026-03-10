import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { computeInvoiceStatus } from "@/lib/bank-reconciliation"

const TX_TIMEOUT = 30000

const schema = z.object({
  links: z
    .array(
      z.object({
        transactionId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      })
    )
    .min(1, "Selecione pelo menos uma conciliação"),
})

const deleteSchema = z.union([
  z.object({ linkId: z.string() }),
  z.object({ transactionId: z.string() }),
])

const VALID_STATUSES = ["PENDENTE", "ENVIADO", "PARCIAL", "PAGO"]

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { links } = parsed.data
    const now = new Date()

    const transactionIds = [...new Set(links.map((l) => l.transactionId))]
    const invoiceIds = [...new Set(links.map((l) => l.invoiceId))]

    const [transactions, invoices] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { id: { in: transactionIds }, clinicId: user.clinicId },
      }),
      prisma.invoice.findMany({
        where: { id: { in: invoiceIds }, clinicId: user.clinicId },
      }),
    ])

    if (transactions.length !== transactionIds.length) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      )
    }

    const foundInvoiceIds = new Set(invoices.map((inv) => inv.id))
    if (invoiceIds.some((id) => !foundInvoiceIds.has(id))) {
      return NextResponse.json(
        { error: "Fatura não encontrada" },
        { status: 404 }
      )
    }

    const invalidInvoices = invoices.filter(
      (inv) => !VALID_STATUSES.includes(inv.status)
    )
    if (invalidInvoices.length > 0) {
      return NextResponse.json(
        { error: "Algumas faturas possuem status inválido para conciliação" },
        { status: 400 }
      )
    }

    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]))
    const txMap = new Map(transactions.map((t) => [t.id, t]))

    try {
      await prisma.$transaction(async (tx) => {
        const [existingInvLinks, existingTxLinks] = await Promise.all([
          tx.reconciliationLink.findMany({
            where: { invoiceId: { in: invoiceIds } },
            select: { invoiceId: true, amount: true },
          }),
          tx.reconciliationLink.findMany({
            where: { transactionId: { in: transactionIds } },
            select: { transactionId: true, amount: true },
          }),
        ])

        // Validate no over-allocation on invoices
        const invAllocated = new Map<string, number>()
        for (const l of existingInvLinks) {
          invAllocated.set(l.invoiceId, (invAllocated.get(l.invoiceId) ?? 0) + Number(l.amount))
        }
        for (const link of links) {
          const current = invAllocated.get(link.invoiceId) ?? 0
          const invoice = invoiceMap.get(link.invoiceId)!
          const totalAmount = Number(invoice.totalAmount)
          if (current + link.amount > totalAmount + 0.01) {
            throw new Error(`Valor excede o total da fatura (máx: ${(totalAmount - current).toFixed(2)})`)
          }
          invAllocated.set(link.invoiceId, current + link.amount)
        }

        // Validate no over-allocation on transactions
        const txAllocated = new Map<string, number>()
        for (const l of existingTxLinks) {
          txAllocated.set(l.transactionId, (txAllocated.get(l.transactionId) ?? 0) + Number(l.amount))
        }
        for (const link of links) {
          const current = txAllocated.get(link.transactionId) ?? 0
          const bankTx = txMap.get(link.transactionId)!
          const txAmount = Number(bankTx.amount)
          if (current + link.amount > txAmount + 0.01) {
            throw new Error(`Valor excede o saldo da transação (máx: ${(txAmount - current).toFixed(2)})`)
          }
          txAllocated.set(link.transactionId, current + link.amount)
        }

        // Create all ReconciliationLink rows
        for (const link of links) {
          await tx.reconciliationLink.create({
            data: {
              clinicId: user.clinicId,
              transactionId: link.transactionId,
              invoiceId: link.invoiceId,
              amount: link.amount,
              reconciledAt: now,
              reconciledByUserId: user.id,
            },
          })
        }

        // For each affected invoice, recalculate status from ALL links
        for (const invoiceId of invoiceIds) {
          const paidAmount = invAllocated.get(invoiceId) ?? 0
          const invoice = invoiceMap.get(invoiceId)!
          const totalAmount = Number(invoice.totalAmount)
          const newStatus = computeInvoiceStatus(paidAmount, totalAmount)

          await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              status: newStatus,
              paidAt: newStatus === "PAGO" ? now : null,
            },
          })
        }
      }, { timeout: TX_TIMEOUT })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao conciliar"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({
      reconciled: links.length,
      message: `${links.length} conciliação(ões) criada(s)`,
    })
  }
)

export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    // Find links to delete
    let linksToDelete: { id: string; invoiceId: string }[]

    if ("linkId" in parsed.data) {
      const link = await prisma.reconciliationLink.findFirst({
        where: { id: parsed.data.linkId, clinicId: user.clinicId },
        select: { id: true, invoiceId: true },
      })
      if (!link) {
        return NextResponse.json(
          { error: "Link de conciliação não encontrado" },
          { status: 404 }
        )
      }
      linksToDelete = [link]
    } else {
      const transaction = await prisma.bankTransaction.findFirst({
        where: { id: parsed.data.transactionId, clinicId: user.clinicId },
      })
      if (!transaction) {
        return NextResponse.json(
          { error: "Transação não encontrada" },
          { status: 404 }
        )
      }
      linksToDelete = await prisma.reconciliationLink.findMany({
        where: {
          transactionId: parsed.data.transactionId,
          clinicId: user.clinicId,
        },
        select: { id: true, invoiceId: true },
      })
      if (linksToDelete.length === 0) {
        return NextResponse.json(
          { error: "Nenhuma conciliação encontrada para esta transação" },
          { status: 404 }
        )
      }
    }

    const affectedInvoiceIds = [
      ...new Set(linksToDelete.map((l) => l.invoiceId)),
    ]
    const linkIdsToDelete = linksToDelete.map((l) => l.id)

    await prisma.$transaction(async (tx) => {
      // Delete the links
      await tx.reconciliationLink.deleteMany({
        where: { id: { in: linkIdsToDelete } },
      })

      // Recalculate status for each affected invoice from remaining links
      for (const invoiceId of affectedInvoiceIds) {
        const remainingLinks = await tx.reconciliationLink.findMany({
          where: { invoiceId },
          select: { amount: true },
        })

        const paidAmount = remainingLinks.reduce(
          (sum, l) => sum + Number(l.amount),
          0
        )

        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          select: { totalAmount: true, paidAt: true },
        })
        const totalAmount = Number(invoice.totalAmount)
        const newStatus = computeInvoiceStatus(paidAmount, totalAmount)

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: newStatus,
            paidAt: newStatus === "PAGO" ? (invoice.paidAt ?? new Date()) : null,
          },
        })
      }
    }, { timeout: TX_TIMEOUT })

    return NextResponse.json({ message: "Conciliação desfeita" })
  }
)
