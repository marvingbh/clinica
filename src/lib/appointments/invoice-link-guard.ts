import type { Prisma, PrismaClient } from "@prisma/client"

type Db = PrismaClient | Prisma.TransactionClient

export interface InvoiceLinkBlock {
  appointmentId: string
  scheduledAt: Date
  invoiceId: string
  invoiceStatus: string
  patientName: string | null
}

/**
 * Returns the subset of `appointmentIds` that cannot be deleted because they
 * have one or more InvoiceItem rows linked to them on a non-cancelled
 * invoice. Deleting any of these would silently NULL the items
 * (`onDelete: SetNull`) and leave them as orphans — which is exactly the bug
 * we're trying to prevent.
 *
 * Cancelled invoices are ignored: their items are already inert and the
 * appointment is free to delete.
 */
export async function findAppointmentsLinkedToInvoices(
  db: Db,
  appointmentIds: string[],
): Promise<InvoiceLinkBlock[]> {
  if (appointmentIds.length === 0) return []
  const items = await db.invoiceItem.findMany({
    where: {
      appointmentId: { in: appointmentIds },
      invoice: { status: { not: "CANCELADO" } },
    },
    select: {
      appointmentId: true,
      invoiceId: true,
      invoice: { select: { status: true, patient: { select: { name: true } } } },
      appointment: { select: { scheduledAt: true } },
    },
  })
  return items.map((it) => ({
    appointmentId: it.appointmentId!,
    scheduledAt: it.appointment?.scheduledAt ?? new Date(0),
    invoiceId: it.invoiceId,
    invoiceStatus: it.invoice.status,
    patientName: it.invoice.patient?.name ?? null,
  }))
}

/**
 * Throwable form of the guard — useful inside transactions where we want to
 * abort and surface the 409 from the outer route handler. Catch with
 * `if (e instanceof InvoiceLinkBlockedError) ...` and return
 * `buildInvoiceLinkError(e.blocks)`.
 */
export class InvoiceLinkBlockedError extends Error {
  constructor(public blocks: InvoiceLinkBlock[]) {
    super("APPOINTMENT_LINKED_TO_INVOICE")
    this.name = "InvoiceLinkBlockedError"
  }
}

/**
 * Convenience formatter for the 409 error body. Returns a stable shape the
 * frontend can render as a list of "X agendamentos vinculados às faturas Y".
 */
export function buildInvoiceLinkError(blocks: InvoiceLinkBlock[]): {
  error: string
  code: "APPOINTMENT_LINKED_TO_INVOICE"
  blocks: InvoiceLinkBlock[]
} {
  const invoiceIds = new Set(blocks.map((b) => b.invoiceId))
  const aptCount = new Set(blocks.map((b) => b.appointmentId)).size
  const message =
    aptCount === 1
      ? `Não é possível excluir: o agendamento está vinculado a uma fatura (${[...invoiceIds][0]}). Remova o item da fatura ou cancele a fatura primeiro.`
      : `Não é possível excluir: ${aptCount} agendamento(s) estão vinculados a ${invoiceIds.size} fatura(s). Remova os itens correspondentes ou cancele as faturas primeiro.`
  return { error: message, code: "APPOINTMENT_LINKED_TO_INVOICE", blocks }
}
