import { prisma } from "@/lib/prisma"

/**
 * "Emitir NFS-e ao receber" hook. When a charge is fully paid and the invoice
 * reaches PAGO, queue the NFS-e for emission if the clinic opted in.
 *
 * Best-effort and fully isolated: this must NEVER throw into the webhook.
 * We flag the invoice with nfseStatus="PENDENTE" so the existing NFS-e UI /
 * retry path picks it up; on any failure we record nfseStatus="ERRO" + nfseErro.
 *
 * Full ADN emission needs request-derived inputs (address overrides, ADN auth)
 * that a webhook cannot synthesize, so we mark it for the existing manual flow
 * rather than emitting inline.
 */
export async function maybeQueueNfseOnPayment(invoiceId: string): Promise<void> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        nfseStatus: true,
        clinic: { select: { nfseConfig: { select: { isActive: true, autoEmitOnPayment: true } } } },
      },
    })
    if (!invoice) return
    if (invoice.status !== "PAGO") return
    if (invoice.nfseStatus != null) return // already emitted / queued / cancelled
    const cfg = invoice.clinic.nfseConfig
    if (!cfg?.isActive || !cfg.autoEmitOnPayment) return

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { nfseStatus: "PENDENTE", nfseErro: null },
    })
  } catch (err) {
    // Never fail the caller (webhook). Record the error for manual retry.
    try {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          nfseStatus: "ERRO",
          nfseErro: err instanceof Error ? err.message : "Falha ao agendar emissão de NFS-e",
        },
      })
    } catch {
      // swallow — nothing more we can do
    }
  }
}
