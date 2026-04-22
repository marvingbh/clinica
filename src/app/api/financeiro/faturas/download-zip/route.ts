import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import archiver from "archiver"
import { PassThrough } from "stream"
import { createInvoiceDocument, createGroupedInvoiceDocument } from "@/lib/financeiro/invoice-pdf"
import { buildInvoicePDFData } from "@/lib/financeiro/build-invoice-pdf-data"
import { audit, AuditAction } from "@/lib/rbac/audit"
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

    // M9 audit: bulk invoice export
    audit.log({
      user,
      action: AuditAction.BATCH_EXPORTED,
      entityType: "Invoice",
      entityId: `${year}-${month}`,
      newValues: { month, year, invoiceCount: invoices.length, professionalId },
      request: req,
    }).catch(() => {})

    // Stream zip response: each PDF is generated sequentially and piped into archiver
    const passthrough = new PassThrough()
    const archive = archiver("zip", { zlib: { level: 1 } }) // low compression — PDFs don't compress much
    archive.pipe(passthrough)

    // Group PER_SESSION invoices by patient; MONTHLY/MANUAL stay individual
    const individualInvoices: typeof invoices = []
    const perSessionGroups = new Map<string, typeof invoices>()

    for (const invoice of invoices) {
      if (invoice.invoiceType === "PER_SESSION") {
        const key = `${invoice.patient.id}-${invoice.professionalProfile.id}`
        const group = perSessionGroups.get(key) || []
        group.push(invoice)
        perSessionGroups.set(key, group)
      } else {
        individualInvoices.push(invoice)
      }
    }

    // Generate PDFs sequentially to control memory usage
    const pdfGeneration = (async () => {
      // Individual invoices (MONTHLY/MANUAL): one PDF each
      for (const invoice of individualInvoices) {
        const pdfData = buildInvoicePDFData(invoice)
        const buffer = await renderToBuffer(createInvoiceDocument(pdfData))
        const mm = MONTH_ABBR[invoice.referenceMonth - 1]
        const prof = invoice.professionalProfile.user.name.split(" ")[0]
        const patient = invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim().replace(/\s+/g, "-")
        archive.append(Buffer.from(buffer), { name: `${mm}-${prof}-${patient}.pdf` })
      }

      // PER_SESSION groups: one multi-page PDF per patient
      for (const [, groupInvoices] of perSessionGroups) {
        const sorted = [...groupInvoices].sort(
          (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        )
        const dataArray = sorted.map(buildInvoicePDFData)
        const buffer = await renderToBuffer(createGroupedInvoiceDocument(dataArray))
        const first = sorted[0]
        const mm = MONTH_ABBR[first.referenceMonth - 1]
        const prof = first.professionalProfile.user.name.split(" ")[0]
        const patient = first.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim().replace(/\s+/g, "-")
        archive.append(Buffer.from(buffer), { name: `${mm}-${prof}-${patient}.pdf` })
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
