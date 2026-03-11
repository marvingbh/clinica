import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import archiver from "archiver"
import { PassThrough } from "stream"
import { createInvoiceDocument } from "@/lib/financeiro/invoice-pdf"
import { buildInvoicePDFData } from "@/lib/financeiro/build-invoice-pdf-data"
import { INVOICE_INCLUDE } from "./query"

const MONTH_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const month = Number(url.searchParams.get("month"))
    const year = Number(url.searchParams.get("year"))
    const professionalId = url.searchParams.get("professionalId")

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json({ error: "Mês e ano são obrigatórios" }, { status: 400 })
    }

    const scope = user.role === "ADMIN" ? "clinic" : "own"

    const whereClause: Record<string, unknown> = {
      clinicId: user.clinicId,
      referenceMonth: month,
      referenceYear: year,
    }
    if (scope === "own" && user.professionalProfileId) {
      whereClause.professionalProfileId = user.professionalProfileId
    } else if (professionalId) {
      whereClause.professionalProfileId = professionalId
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: INVOICE_INCLUDE,
      orderBy: { patient: { name: "asc" } },
    })

    if (invoices.length === 0) {
      return NextResponse.json({ error: "Nenhuma fatura encontrada para este período" }, { status: 404 })
    }

    // Stream zip response: each PDF is generated sequentially and piped into archiver
    const passthrough = new PassThrough()
    const archive = archiver("zip", { zlib: { level: 1 } }) // low compression — PDFs don't compress much
    archive.pipe(passthrough)

    // Generate PDFs sequentially to control memory usage
    const pdfGeneration = (async () => {
      for (const invoice of invoices) {
        const pdfData = buildInvoicePDFData(invoice)
        const buffer = await renderToBuffer(createInvoiceDocument(pdfData))
        const mm = MONTH_ABBR[invoice.referenceMonth - 1]
        const prof = invoice.professionalProfile.user.name.split(" ")[0]
        const patient = invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim().replace(/\s+/g, "-")
        const dateSuffix = invoice.invoiceType === "PER_SESSION" && invoice.items[0]?.appointment
          ? `-${new Date(invoice.items[0].appointment.scheduledAt).toLocaleDateString("pt-BR").replace(/\//g, "-")}`
          : ""
        archive.append(Buffer.from(buffer), { name: `${mm}-${prof}-${patient}${dateSuffix}.pdf` })
      }
      await archive.finalize()
    })()

    // Convert Node stream to Web ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        passthrough.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        passthrough.on("end", () => controller.close())
        passthrough.on("error", (err) => controller.error(err))
      },
    })

    // Attach error handling
    pdfGeneration.catch(() => passthrough.destroy())

    const monthName = MONTH_ABBR[month - 1]
    const filename = `faturas-${monthName}-${year}.zip`

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }
)
