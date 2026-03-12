import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get("q")?.trim()
    const month = searchParams.get("month")
    const year = searchParams.get("year")

    if (!query || query.length < 2) {
      return NextResponse.json({ invoices: [] })
    }

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      OR: [
        { status: { in: ["PENDENTE", "ENVIADO", "PARCIAL"] } },
        { status: "PAGO", reconciliationLinks: { none: {} } },
      ],
      patient: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { motherName: { contains: query, mode: "insensitive" } },
          { fatherName: { contains: query, mode: "insensitive" } },
        ],
      },
    }

    if (month && year) {
      where.referenceMonth = parseInt(month, 10)
      where.referenceYear = parseInt(year, 10)
    }

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        referenceMonth: true,
        referenceYear: true,
        dueDate: true,
        status: true,
        patient: {
          select: {
            name: true,
            motherName: true,
            fatherName: true,
          },
        },
        reconciliationLinks: {
          select: { amount: true },
        },
      },
      take: 20,
      orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
    })

    return NextResponse.json({
      invoices: invoices.map((inv) => {
        const total = Number(inv.totalAmount)
        const paid = inv.reconciliationLinks.reduce(
          (sum, link) => sum + Number(link.amount),
          0
        )
        return {
          invoiceId: inv.id,
          patientName: inv.patient.name,
          motherName: inv.patient.motherName,
          fatherName: inv.patient.fatherName,
          status: inv.status,
          totalAmount: total,
          remainingAmount: total - paid,
          referenceMonth: inv.referenceMonth,
          referenceYear: inv.referenceYear,
          dueDate: inv.dueDate?.toISOString() ?? null,
        }
      }),
    })
  }
)
