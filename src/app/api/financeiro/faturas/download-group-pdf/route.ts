import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import { createGroupedInvoiceDocument } from "@/lib/financeiro/invoice-pdf"
import { buildInvoicePDFData } from "@/lib/financeiro/build-invoice-pdf-data"
import { INVOICE_INCLUDE } from "../download-zip/query"

/**
 * GET /api/financeiro/faturas/download-group-pdf?ids=id1,id2,id3
 * Generates a single PDF with one page per invoice (for grouped PER_SESSION downloads).
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const idsParam = url.searchParams.get("ids")

    if (!idsParam) {
      return NextResponse.json({ error: "IDs das faturas são obrigatórios" }, { status: 400 })
    }

    const ids = idsParam.split(",").filter(Boolean)
    if (ids.length === 0) {
      return NextResponse.json({ error: "IDs das faturas são obrigatórios" }, { status: 400 })
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: ids },
        clinicId: user.clinicId,
      },
      include: INVOICE_INCLUDE,
      orderBy: { dueDate: "asc" },
    })

    if (invoices.length === 0) {
      return NextResponse.json({ error: "Nenhuma fatura encontrada" }, { status: 404 })
    }

    const dataArray = invoices.map(buildInvoicePDFData)
    const buffer = await renderToBuffer(createGroupedInvoiceDocument(dataArray))

    const patient = invoices[0].patient.name.replace(/\s*\(.*?\)\s*/g, "").trim().replace(/\s+/g, "-")
    const month = String(invoices[0].referenceMonth).padStart(2, "0")
    const year = invoices[0].referenceYear
    const filename = `faturas-${patient}-${month}-${year}.pdf`

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }
)
