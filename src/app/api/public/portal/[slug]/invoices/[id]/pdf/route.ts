import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { createInvoiceDocument } from "@/lib/financeiro/invoice-pdf"
import { buildInvoicePDFData } from "@/lib/financeiro/build-invoice-pdf-data"
import { INVOICE_INCLUDE } from "@/app/api/financeiro/faturas/download-zip/query"
import { withPortalSession } from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

/**
 * GET /api/public/portal/[slug]/invoices/[id]/pdf
 * Same PDF pipeline as the staff route; scoped to the session's patients.
 */
export const GET = withPortalSession(
  async (req, ctx, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: ctx.clinic.id, patientId: { in: ctx.patientIds } },
      include: INVOICE_INCLUDE,
    })
    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const pdfData = buildInvoicePDFData(invoice)
    const buffer = await renderToBuffer(createInvoiceDocument(pdfData))
    const uint8 = new Uint8Array(buffer)

    const ip = getClientIp(req.headers)
    await prisma.auditLog.create({
      data: {
        clinicId: ctx.clinic.id,
        userId: null,
        action: "PORTAL_INVOICE_DOWNLOADED",
        entityType: "Invoice",
        entityId: invoice.id,
        newValues: { patientId: invoice.patientId },
        ipAddress: ip !== "unknown" ? ip : null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    })

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="fatura-${MONTH_ABBR[invoice.referenceMonth - 1]}-${invoice.referenceYear}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  },
  { requireScope: "FULL" },
)
