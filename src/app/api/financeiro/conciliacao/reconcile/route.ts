import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const schema = z.object({
  matches: z
    .array(
      z.object({
        transactionId: z.string(),
        invoiceId: z.string(),
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

    // Validate all transactions and invoices belong to clinic
    const transactionIds = matches.map((m) => m.transactionId)
    const invoiceIds = matches.map((m) => m.invoiceId)

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
    if (invoices.length !== invoiceIds.length) {
      return NextResponse.json(
        { error: "Fatura não encontrada" },
        { status: 404 }
      )
    }

    // Check none already reconciled
    const alreadyReconciled = transactions.filter(
      (tx) => tx.reconciledInvoiceId
    )
    if (alreadyReconciled.length > 0) {
      return NextResponse.json(
        { error: "Algumas transações já foram conciliadas" },
        { status: 400 }
      )
    }

    // Check all invoices are PENDENTE or ENVIADO
    const invalidInvoices = invoices.filter(
      (inv) => !["PENDENTE", "ENVIADO"].includes(inv.status)
    )
    if (invalidInvoices.length > 0) {
      return NextResponse.json(
        { error: "Algumas faturas não estão pendentes" },
        { status: 400 }
      )
    }

    // Apply reconciliation in transaction
    await prisma.$transaction(async (tx) => {
      for (const match of matches) {
        await tx.bankTransaction.update({
          where: { id: match.transactionId },
          data: {
            reconciledInvoiceId: match.invoiceId,
            reconciledAt: now,
            reconciledByUserId: user.id,
          },
        })

        await tx.invoice.update({
          where: { id: match.invoiceId },
          data: {
            status: "PAGO",
            paidAt: now,
          },
        })
      }
    })

    return NextResponse.json({
      reconciled: matches.length,
      message: `${matches.length} fatura(s) marcada(s) como paga(s)`,
    })
  }
)
