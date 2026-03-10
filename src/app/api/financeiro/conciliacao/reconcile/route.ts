import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const deleteSchema = z.object({
  transactionId: z.string(),
})

const schema = z.object({
  matches: z
    .array(
      z.object({
        transactionId: z.string(),
        invoiceIds: z.array(z.string()).min(1),
      })
    )
    .min(1, "Selecione pelo menos uma conciliação"),
})

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

    const { matches } = parsed.data
    const now = new Date()

    const transactionIds = matches.map((m) => m.transactionId)
    const allInvoiceIds = matches.flatMap((m) => m.invoiceIds)

    const [transactions, invoices] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { id: { in: transactionIds }, clinicId: user.clinicId },
      }),
      prisma.invoice.findMany({
        where: { id: { in: allInvoiceIds }, clinicId: user.clinicId },
      }),
    ])

    if (transactions.length !== transactionIds.length) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      )
    }

    const foundIds = new Set(invoices.map((inv) => inv.id))
    if (allInvoiceIds.some((id) => !foundIds.has(id))) {
      return NextResponse.json(
        { error: "Fatura não encontrada" },
        { status: 404 }
      )
    }

    const alreadyReconciled = transactions.filter((tx) => tx.reconciledInvoiceId)
    if (alreadyReconciled.length > 0) {
      return NextResponse.json(
        { error: "Algumas transações já foram conciliadas" },
        { status: 400 }
      )
    }

    const invalidInvoices = invoices.filter(
      (inv) => !["PENDENTE", "ENVIADO", "PAGO"].includes(inv.status)
    )
    if (invalidInvoices.length > 0) {
      return NextResponse.json(
        { error: "Algumas faturas possuem status inválido para conciliação" },
        { status: 400 }
      )
    }

    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]))
    const txMap = new Map(transactions.map((tx) => [tx.id, tx]))

    let totalReconciled = 0

    await prisma.$transaction(async (tx) => {
      for (const match of matches) {
        const bankTx = txMap.get(match.transactionId)!
        const invoiceIds = match.invoiceIds

        // First invoice: link to the original bank transaction
        await tx.bankTransaction.update({
          where: { id: match.transactionId },
          data: {
            reconciledInvoiceId: invoiceIds[0],
            reconciledAt: now,
            reconciledByUserId: user.id,
          },
        })

        // Additional invoices: create split bank transaction records
        for (let i = 1; i < invoiceIds.length; i++) {
          await tx.bankTransaction.create({
            data: {
              clinicId: user.clinicId,
              bankIntegrationId: bankTx.bankIntegrationId,
              externalId: `${bankTx.externalId}:split-${i + 1}`,
              date: bankTx.date,
              amount: bankTx.amount,
              description: bankTx.description,
              payerName: bankTx.payerName,
              type: bankTx.type,
              reconciledInvoiceId: invoiceIds[i],
              reconciledAt: now,
              reconciledByUserId: user.id,
            },
          })
        }

        // Mark all invoices as PAGO
        for (const invoiceId of invoiceIds) {
          const invoice = invoiceMap.get(invoiceId)!
          if (invoice.status !== "PAGO") {
            await tx.invoice.update({
              where: { id: invoiceId },
              data: { status: "PAGO", paidAt: now },
            })
          }
          totalReconciled++
        }
      }
    })

    return NextResponse.json({
      reconciled: totalReconciled,
      message: `${totalReconciled} fatura(s) conciliada(s)`,
    })
  }
)

export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { transactionId } = parsed.data

    const bankTx = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, clinicId: user.clinicId, reconciledInvoiceId: { not: null } },
    })
    if (!bankTx) {
      return NextResponse.json({ error: "Transação não encontrada ou não conciliada" }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      // Find all linked records (original + splits)
      const allLinked = await tx.bankTransaction.findMany({
        where: {
          clinicId: user.clinicId,
          reconciledInvoiceId: { not: null },
          OR: [
            { id: transactionId },
            { externalId: { startsWith: `${bankTx.externalId}:split-` } },
          ],
        },
      })

      const invoiceIds = allLinked
        .map((t) => t.reconciledInvoiceId)
        .filter((id): id is string => id !== null)

      // Revert invoices to PENDENTE
      for (const invoiceId of invoiceIds) {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: "PENDENTE", paidAt: null },
        })
      }

      // Clear reconciliation on the original transaction
      await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { reconciledInvoiceId: null, reconciledAt: null, reconciledByUserId: null },
      })

      // Delete split records
      await tx.bankTransaction.deleteMany({
        where: {
          clinicId: user.clinicId,
          externalId: { startsWith: `${bankTx.externalId}:split-` },
        },
      })
    })

    return NextResponse.json({ message: "Conciliação desfeita" })
  }
)
