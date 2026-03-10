import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const patientId = url.searchParams.get("patientId")

    if (!patientId) {
      return NextResponse.json({ error: "patientId é obrigatório" }, { status: 400 })
    }

    // Center the 3-month window around the given month/year, or now
    const refMonth = url.searchParams.get("month")
    const refYear = url.searchParams.get("year")
    const anchor = refMonth && refYear
      ? new Date(Number(refYear), Number(refMonth) - 1, 1)
      : new Date()
    const startDate = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
    const endDate = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 1)

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId,
        status: { in: ["AGENDADO", "CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA"] },
        type: { in: ["CONSULTA", "REUNIAO"] },
        scheduledAt: { gte: startDate, lt: endDate },
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        type: true,
        title: true,
        price: true,
        professionalProfileId: true,
        professionalProfile: { select: { user: { select: { name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    })

    // Exclude appointments linked to a PAGO invoice (already paid)
    const invoicedItems = await prisma.invoiceItem.findMany({
      where: {
        appointmentId: { in: appointments.map(a => a.id) },
        invoice: { status: "PAGO" },
      },
      select: { appointmentId: true },
    })
    const paidIds = new Set(invoicedItems.map(i => i.appointmentId))

    const unbilled = appointments.filter(a => !paidIds.has(a.id))

    return NextResponse.json(unbilled)
  }
)
