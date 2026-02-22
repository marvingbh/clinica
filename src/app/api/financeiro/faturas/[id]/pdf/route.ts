import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import { createInvoiceDocument } from "@/lib/financeiro/invoice-pdf"
import { formatCurrencyBRL } from "@/lib/financeiro/format"

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
      include: {
        clinic: { select: { name: true, phone: true } },
        patient: { select: { name: true } },
        professionalProfile: { select: { user: { select: { name: true } } } },
        items: { orderBy: { createdAt: "asc" } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const pdfData = {
      clinicName: invoice.clinic.name,
      clinicPhone: invoice.clinic.phone || undefined,
      patientName: invoice.patient.name,
      professionalName: invoice.professionalProfile.user.name,
      referenceMonth: invoice.referenceMonth,
      referenceYear: invoice.referenceYear,
      status: invoice.status,
      dueDate: new Date(invoice.dueDate).toLocaleDateString("pt-BR"),
      totalAmount: formatCurrencyBRL(Number(invoice.totalAmount)),
      messageBody: invoice.messageBody,
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: formatCurrencyBRL(Number(item.unitPrice)),
        total: formatCurrencyBRL(Number(item.total)),
        type: item.type,
      })),
    }

    const buffer = await renderToBuffer(
      createInvoiceDocument(pdfData)
    )

    // Convert Node.js Buffer to Uint8Array for NextResponse compatibility
    const uint8 = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="fatura-${invoice.patient.name.replace(/\s+/g, "-")}-${invoice.referenceMonth}-${invoice.referenceYear}.pdf"`,
      },
    })
  }
)
