import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { RECIBO_ELIGIBLE_ITEM_TYPES } from "@/lib/documents"
import { canAccessPatientDocuments } from "../_lib/scope"
import { formatCurrencyBRL } from "@/lib/financeiro/format"

export const GET = withFeatureAuth(
  { feature: "documents", minAccess: "READ" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const sp = new URL(req.url).searchParams
    const patientId = sp.get("patientId")
    const from = sp.get("from")
    const to = sp.get("to")
    if (!patientId) {
      return NextResponse.json({ error: "patientId obrigatório" }, { status: 400 })
    }

    if (!(await canAccessPatientDocuments(user, patientId))) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    const scheduledFilter: Record<string, Date> = {}
    if (from) {
      const d = new Date(from)
      if (!isNaN(d.getTime())) scheduledFilter.gte = d
    }
    if (to) {
      const d = new Date(to)
      if (!isNaN(d.getTime())) scheduledFilter.lte = d
    }

    const items = await prisma.invoiceItem.findMany({
      where: {
        invoice: { clinicId: user.clinicId, patientId, status: "PAGO" },
        type: { in: RECIBO_ELIGIBLE_ITEM_TYPES as never },
        ...(Object.keys(scheduledFilter).length > 0
          ? { appointment: { scheduledAt: scheduledFilter } }
          : {}),
      },
      select: {
        id: true, description: true, total: true, type: true,
        appointment: { select: { scheduledAt: true, endAt: true } },
      },
      orderBy: { appointment: { scheduledAt: "asc" } },
    })

    const result = items.map((it) => ({
      id: it.id,
      description: it.description,
      type: it.type,
      total: formatCurrencyBRL(Number(it.total)),
      scheduledAt: it.appointment?.scheduledAt?.toISOString() ?? null,
      endAt: it.appointment?.endAt?.toISOString() ?? null,
    }))

    return NextResponse.json({ items: result })
  }
)
