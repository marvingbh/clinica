import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { buildDanfseData } from "@/lib/nfse/danfse-data-builder"
import { createDanfseDocument } from "@/lib/nfse/danfse-pdf"
import { withPortalSession } from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

/**
 * GET /api/public/portal/[slug]/invoices/[id]/danfse
 * DANFSE PDF for an invoice with an EMITIDA NFS-e (invoice-level). 404 otherwise.
 */
export const GET = withPortalSession(
  async (req, ctx, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: ctx.clinic.id,
        patientId: { in: ctx.patientIds },
        nfseStatus: "EMITIDA",
        nfseXml: { not: null },
      },
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
      return NextResponse.json({ error: "NFS-e não encontrada" }, { status: 404 })
    }

    const danfseData = buildDanfseData(invoice)
    if (!danfseData) {
      return NextResponse.json({ error: "NFS-e não encontrada" }, { status: 404 })
    }

    const QRCode = await import("qrcode")
    danfseData.qrCodeDataUri = await QRCode.toDataURL(danfseData.verificacaoUrl, {
      width: 120,
      margin: 1,
    })
    const buffer = await renderToBuffer(createDanfseDocument(danfseData))
    const uint8 = new Uint8Array(buffer)

    const ip = getClientIp(req.headers)
    await prisma.auditLog.create({
      data: {
        clinicId: ctx.clinic.id,
        userId: null,
        action: "PORTAL_DANFSE_DOWNLOADED",
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
        "Content-Disposition": `attachment; filename="NFS-e-${invoice.nfseNumero || invoice.id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  },
  { requireScope: "FULL" },
)
