import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import { buildDanfseData } from "@/lib/nfse/danfse-data-builder"
import { createDanfseDocument } from "@/lib/nfse/danfse-pdf"
import archiver from "archiver"
import { PassThrough } from "stream"

const MONTH_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

/**
 * GET /api/financeiro/faturas/download-nfse-pdf?month=X&year=Y
 * Downloads a ZIP of NFS-e PDFs for all emitted invoices in the period.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const month = Number(url.searchParams.get("month"))
    const year = Number(url.searchParams.get("year"))

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json({ error: "Mês e ano são obrigatórios" }, { status: 400 })
    }

    const where = { clinicId: user.clinicId, referenceMonth: month, referenceYear: year }

    // Fetch per-invoice emitted NFS-e with XML
    const invoices = await prisma.invoice.findMany({
      where: { ...where, nfseStatus: "EMITIDA", nfseXml: { not: null } },
      include: {
        patient: { select: { name: true, billingResponsibleName: true, billingCpf: true, cpf: true, addressStreet: true, addressNumber: true, addressNeighborhood: true, addressCity: true, addressState: true, addressZip: true } },
        clinic: { include: { nfseConfig: true } },
      },
    })

    // Fetch per-item emissions with XML
    const emissions = await prisma.nfseEmission.findMany({
      where: { invoice: where, status: "EMITIDA", xml: { not: null } },
      include: {
        invoice: {
          include: {
            patient: { select: { name: true, billingResponsibleName: true, billingCpf: true, cpf: true, addressStreet: true, addressNumber: true, addressNeighborhood: true, addressCity: true, addressState: true, addressZip: true } },
            clinic: { include: { nfseConfig: true } },
          },
        },
      },
    })

    if (invoices.length === 0 && emissions.length === 0) {
      return NextResponse.json({ error: "Nenhuma NFS-e emitida encontrada para este período" }, { status: 404 })
    }

    const passthrough = new PassThrough()
    const archive = archiver("zip", { zlib: { level: 5 } })
    archive.pipe(passthrough)

    const QRCode = await import("qrcode")

    const zipGeneration = (async () => {
      const usedNames = new Set<string>()

      function uniqueName(base: string): string {
        let name = base
        let i = 2
        while (usedNames.has(name)) { name = `${base.replace(".pdf", "")}-${i}.pdf`; i++ }
        usedNames.add(name)
        return name
      }

      function sanitize(s: string): string {
        return s.replace(/\s*\(.*?\)\s*$/, "").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
      }

      // Generate PDFs for per-invoice NFS-e
      for (const inv of invoices) {
        try {
          const danfseData = buildDanfseData(inv)
          if (!danfseData) continue
          danfseData.qrCodeDataUri = await QRCode.toDataURL(danfseData.verificacaoUrl, { width: 120, margin: 1 })
          const buffer = await renderToBuffer(createDanfseDocument(danfseData))
          const patient = sanitize(inv.patient.name)
          const num = inv.nfseNumero || "sem-numero"
          archive.append(Buffer.from(buffer), { name: uniqueName(`NFS-e-${num}-${patient}.pdf`) })
        } catch {
          // Skip failed PDFs
        }
      }

      // Generate PDFs for per-item emissions
      for (const em of emissions) {
        try {
          const nfseConfig = em.invoice.clinic.nfseConfig
          if (!nfseConfig) continue
          const emAsInvoice = {
            nfseNumero: em.numero,
            nfseChaveAcesso: em.chaveAcesso,
            nfseCodigoVerificacao: em.codigoVerificacao,
            nfseEmitidaAt: em.emitidaAt,
            nfseDescricao: em.descricao,
            nfseAliquotaIss: nfseConfig.aliquotaIss,
            nfseCodigoServico: nfseConfig.codigoServico,
            nfseXml: em.xml,
            totalAmount: em.valor,
            patient: em.invoice.patient,
            clinic: em.invoice.clinic,
          }
          const danfseData = buildDanfseData(emAsInvoice)
          if (!danfseData) continue
          danfseData.qrCodeDataUri = await QRCode.toDataURL(danfseData.verificacaoUrl, { width: 120, margin: 1 })
          const buffer = await renderToBuffer(createDanfseDocument(danfseData))
          const patient = sanitize(em.invoice.patient.name)
          const num = em.numero || "sem-numero"
          archive.append(Buffer.from(buffer), { name: uniqueName(`NFS-e-${num}-${patient}.pdf`) })
        } catch {
          // Skip failed PDFs
        }
      }

      await archive.finalize()
    })()

    const readable = new ReadableStream({
      start(controller) {
        passthrough.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        passthrough.on("end", () => controller.close())
        passthrough.on("error", (err) => controller.error(err))
      },
    })

    zipGeneration.catch(() => {})

    const monthName = MONTH_ABBR[month - 1]
    return new NextResponse(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="nfse-pdf-${monthName}-${year}.zip"`,
      },
    })
  }
)
