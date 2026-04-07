import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import { buildDanfseData } from "@/lib/nfse/danfse-data-builder"
import { createDanfseDocument } from "@/lib/nfse/danfse-pdf"
import { fetchDanfse, type AdnConfig } from "@/lib/nfse/adn-client"

/**
 * GET /api/financeiro/faturas/[id]/nfse/pdf
 * Generates the DANFSE PDF locally from stored data.
 * Falls back to the ADN endpoint if local generation fails.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        patient: {
          select: {
            name: true,
            billingResponsibleName: true,
            billingCpf: true,
            cpf: true,
            addressStreet: true,
            addressNumber: true,
            addressNeighborhood: true,
            addressCity: true,
            addressState: true,
            addressZip: true,
          },
        },
        clinic: { include: { nfseConfig: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    const url = new URL(req.url)
    const emissionId = url.searchParams.get("emissionId")
    const forceAdn = url.searchParams.get("source") === "adn"
    const patientName = invoice.patient.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")

    // Per-item emission PDF
    if (emissionId) {
      const emission = await prisma.nfseEmission.findFirst({
        where: { id: emissionId, invoiceId: invoice.id },
      })
      if (!emission || emission.status !== "EMITIDA" || !emission.chaveAcesso) {
        return NextResponse.json({ error: "NFS-e nao emitida para esta emissao" }, { status: 400 })
      }

      const emFilename = `NFS-e-${emission.numero || "sem-numero"}-${patientName}.pdf`
      const nfseConfig = invoice.clinic.nfseConfig

      // Try local DANFSE generation first (unless forced ADN)
      if (!forceAdn && emission.xml && nfseConfig) {
        const emissionAsInvoice = {
          nfseNumero: emission.numero,
          nfseChaveAcesso: emission.chaveAcesso,
          nfseCodigoVerificacao: emission.codigoVerificacao,
          nfseEmitidaAt: emission.emitidaAt,
          nfseDescricao: emission.descricao,
          nfseAliquotaIss: nfseConfig.aliquotaIss,
          nfseCodigoServico: nfseConfig.codigoServico,
          nfseXml: emission.xml,
          totalAmount: emission.valor,
          patient: invoice.patient,
          clinic: invoice.clinic,
        }
        const danfseData = buildDanfseData(emissionAsInvoice)
        if (danfseData) {
          try {
            const QRCode = await import("qrcode")
            danfseData.qrCodeDataUri = await QRCode.toDataURL(danfseData.verificacaoUrl, { width: 120, margin: 1 })
            const buffer = await renderToBuffer(createDanfseDocument(danfseData))
            return new NextResponse(new Uint8Array(buffer), {
              headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${emFilename}"` },
            })
          } catch {
            // Local generation failed — fall through to ADN
          }
        }
      }

      // Fallback: fetch from ADN
      if (!nfseConfig) {
        return NextResponse.json({ error: "Configuracao NFS-e nao encontrada" }, { status: 400 })
      }
      try {
        const adnConfig: AdnConfig = {
          clinicId: user.clinicId, invoiceId: invoice.id,
          certificatePem: nfseConfig.certificatePem, privateKeyPem: nfseConfig.privateKeyPem,
          useSandbox: nfseConfig.useSandbox,
        }
        const pdfBuffer = await fetchDanfse(emission.chaveAcesso, adnConfig)
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${emFilename}"` },
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Erro desconhecido"
        const isAdnUnavailable = msg.includes("502") || msg.includes("503") || msg.includes("504")
        return NextResponse.json(
          { error: isAdnUnavailable
            ? "O servidor do ADN esta temporariamente indisponivel. Tente novamente em alguns minutos."
            : `Erro ao baixar DANFSE: ${msg}` },
          { status: isAdnUnavailable ? 503 : 500 }
        )
      }
    }

    if (invoice.nfseStatus !== "EMITIDA" || !invoice.nfseChaveAcesso) {
      return NextResponse.json({ error: "NFS-e nao emitida para esta fatura" }, { status: 400 })
    }

    const filename = `NFS-e-${invoice.nfseNumero || "sem-numero"}-${patientName}.pdf`

    // source=adn → Gov.br (public + ADN endpoints)
    // default → local DANFSE generation
    if (forceAdn) {
      const nfseConfig = invoice.clinic.nfseConfig
      if (!nfseConfig) {
        return NextResponse.json({ error: "Configuracao NFS-e nao encontrada" }, { status: 400 })
      }
      try {
        const adnConfig: AdnConfig = {
          clinicId: user.clinicId, invoiceId: invoice.id,
          certificatePem: nfseConfig.certificatePem, privateKeyPem: nfseConfig.privateKeyPem,
          useSandbox: nfseConfig.useSandbox,
        }
        const pdfBuffer = await fetchDanfse(invoice.nfseChaveAcesso, adnConfig)
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Erro desconhecido"
        return NextResponse.json({ error: `Erro ao baixar DANFSE do Gov.br: ${msg}` }, { status: 500 })
      }
    }

    // Local DANFSE generation
    const danfseData = buildDanfseData(invoice)
    if (danfseData) {
      try {
        const QRCode = await import("qrcode")
        danfseData.qrCodeDataUri = await QRCode.toDataURL(danfseData.verificacaoUrl, { width: 120, margin: 1 })
        const buffer = await renderToBuffer(createDanfseDocument(danfseData))
        return new NextResponse(new Uint8Array(buffer), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
        })
      } catch {
        // Local generation failed
      }
    }

    return NextResponse.json({ error: "Nao foi possivel gerar o PDF local." }, { status: 500 })
  }
)
