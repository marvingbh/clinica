import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import archiver from "archiver"
import { PassThrough } from "stream"

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

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json({ error: "Mês e ano são obrigatórios" }, { status: 400 })
    }

    const where = {
      clinicId: user.clinicId,
      referenceMonth: month,
      referenceYear: year,
    }

    // Fetch per-invoice XMLs (nfseStatus = EMITIDA)
    const invoices = await prisma.invoice.findMany({
      where: { ...where, nfseStatus: "EMITIDA", nfseXml: { not: null } },
      select: {
        nfseNumero: true,
        nfseXml: true,
        patient: { select: { name: true } },
      },
    })

    // Fetch per-item emission XMLs
    const emissions = await prisma.nfseEmission.findMany({
      where: {
        invoice: where,
        status: "EMITIDA",
        xml: { not: null },
      },
      select: {
        numero: true,
        xml: true,
        invoice: { select: { patient: { select: { name: true } } } },
      },
    })

    const totalXmls = invoices.length + emissions.length
    if (totalXmls === 0) {
      return NextResponse.json({ error: "Nenhum XML de NFS-e encontrado para este período" }, { status: 404 })
    }

    const passthrough = new PassThrough()
    const archive = archiver("zip", { zlib: { level: 5 } })
    archive.pipe(passthrough)

    const zipGeneration = (async () => {
      const usedNames = new Set<string>()

      function uniqueName(base: string): string {
        let name = base
        let i = 2
        while (usedNames.has(name)) { name = `${base.replace(".xml", "")}-${i}.xml`; i++ }
        usedNames.add(name)
        return name
      }

      function sanitize(s: string): string {
        return s.replace(/\s*\(.*?\)\s*$/, "").trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
      }

      for (const inv of invoices) {
        const patient = sanitize(inv.patient.name)
        const num = inv.nfseNumero || "sem-numero"
        const fileName = uniqueName(`NFS-e-${num}-${patient}.xml`)
        archive.append(inv.nfseXml!, { name: fileName })
      }

      for (const em of emissions) {
        const patient = sanitize(em.invoice.patient.name)
        const num = em.numero || "sem-numero"
        const fileName = uniqueName(`NFS-e-${num}-${patient}.xml`)
        archive.append(em.xml!, { name: fileName })
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

    zipGeneration.catch(() => passthrough.destroy())

    const monthName = MONTH_ABBR[month - 1]
    const filename = `nfse-xml-${monthName}-${year}.zip`

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }
)
