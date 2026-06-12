import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { loadReciboData, exportableRows, yearWindow } from "@/lib/fiscal"

/**
 * GET /api/financeiro/fiscal/pending-count
 * Count of valid recibo rows in the current year without an EMITIDO/EXPORTADO
 * emission, scoped to the caller (PROFESSIONAL: own; ADMIN: clinic). Drives the
 * dashboard chip.
 */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (_req, { user }) => {
    const { from, to } = yearWindow(new Date().getFullYear())
    const professionalProfileId =
      user.role === "PROFESSIONAL" ? user.professionalProfileId ?? "__none__" : undefined

    const { rows, statusByKey } = await loadReciboData(prisma, {
      clinicId: user.clinicId,
      from,
      to,
      professionalProfileId,
    })

    const pendingRecibos = exportableRows(rows).filter((row) => {
      const e = statusByKey.get(row.paymentKey)
      return !e || e.status === "ERRO"
    }).length

    return NextResponse.json({ pendingRecibos })
  }
)
