import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

const MAX_PDF_SIZE = 5 * 1024 * 1024 // 5MB

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 })
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Apenas arquivos PDF são aceitos" }, { status: 400 })
    }
    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json({ error: "Arquivo excede 5MB" }, { status: 400 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true },
    })
    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    await prisma.invoice.update({
      where: { id: params.id },
      data: {
        notaFiscalPdf: buffer,
        notaFiscalEmitida: true,
        notaFiscalEmitidaAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  }
)

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { notaFiscalPdf: true, patient: { select: { name: true } } },
    })

    if (!invoice || !invoice.notaFiscalPdf) {
      return NextResponse.json({ error: "PDF não encontrado" }, { status: 404 })
    }

    const fileName = `nota-fiscal-${invoice.patient.name.replace(/\s+/g, "-")}.pdf`

    return new NextResponse(invoice.notaFiscalPdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    })
  }
)

export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true },
    })
    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    await prisma.invoice.update({
      where: { id: params.id },
      data: { notaFiscalPdf: null },
    })

    return NextResponse.json({ success: true })
  }
)
