import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import { createInvoiceDocument } from "@/lib/financeiro/invoice-pdf"
import { buildInvoicePDFData } from "@/lib/financeiro/build-invoice-pdf-data"
import { INVOICE_INCLUDE } from "@/app/api/financeiro/faturas/download-zip/query"

const MONTH_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: INVOICE_INCLUDE,
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const pdfData = buildInvoicePDFData(invoice)

    const buffer = await renderToBuffer(
      createInvoiceDocument(pdfData)
    )

    const uint8 = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${MONTH_ABBR[invoice.referenceMonth - 1]}-${invoice.professionalProfile.user.name.split(" ")[0]}-${invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim().replace(/\s+/g, "-")}.pdf"`,
      },
    })
  }
)
