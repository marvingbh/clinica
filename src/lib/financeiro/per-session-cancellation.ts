/**
 * Per-session invoice cancellation logic.
 *
 * When a per-session invoice's appointment is cancelled:
 * - PENDENTE/ENVIADO → cancel the invoice
 * - PAGO/PARCIAL → leave invoice, credit handled by existing flow
 * - CANCELADO → do nothing (already cancelled)
 */

type InvoiceStatus = "PENDENTE" | "ENVIADO" | "PARCIAL" | "PAGO" | "CANCELADO"

export function shouldCancelPerSessionInvoice(invoiceStatus: string): boolean {
  return invoiceStatus === "PENDENTE" || invoiceStatus === "ENVIADO"
}

/**
 * Handle per-session invoice cancellation.
 * Finds the PER_SESSION invoice for the given appointment and cancels it if unpaid.
 * Returns what action was taken.
 */
export async function handlePerSessionCancellation(
  tx: any,
  appointmentId: string,
  clinicId: string
): Promise<"cancelled" | "none"> {
  // Find the invoice item linked to this appointment, on a PER_SESSION invoice
  const invoiceItem = await tx.invoiceItem.findFirst({
    where: { appointmentId },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceType: true,
          clinicId: true,
          status: true,
        },
      },
    },
  })

  if (!invoiceItem?.invoice) return "none"

  const invoice = invoiceItem.invoice
  if (invoice.invoiceType !== "PER_SESSION" || invoice.clinicId !== clinicId) {
    return "none"
  }

  if (!shouldCancelPerSessionInvoice(invoice.status)) {
    return "none"
  }

  // Release any consumed session credits on this invoice
  await tx.sessionCredit.updateMany({
    where: { consumedByInvoiceId: invoice.id },
    data: { consumedByInvoiceId: null, consumedAt: null },
  })

  // Cancel the invoice
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status: "CANCELADO" },
  })

  return "cancelled"
}
