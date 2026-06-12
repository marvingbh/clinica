import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  loadReciboData,
  parsePeriodParams,
  serializeReciboRow,
  serializeIssue,
  type EmissionStatusSnapshot,
} from "@/lib/fiscal"

/**
 * GET /api/financeiro/fiscal/receita-saude/payments?from&to&professionalId
 * Returns recibo rows (with emission status), pending issues and the list of
 * professionals. PROFESSIONAL is forced to their own professionalProfileId.
 */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const { from, to } = parsePeriodParams(url.searchParams)

    // Self-scope: a PROFESSIONAL only ever sees their own events.
    const requested = url.searchParams.get("professionalId") || undefined
    const professionalProfileId =
      user.role === "PROFESSIONAL" ? user.professionalProfileId ?? "__none__" : requested

    const { rows, statusByKey, issues, professionals } = await loadReciboData(prisma, {
      clinicId: user.clinicId,
      from,
      to,
      professionalProfileId,
    })

    const serialized = rows.map((row) => {
      const e = statusByKey.get(row.paymentKey)
      const status: EmissionStatusSnapshot | null = e
        ? {
            status: e.status as EmissionStatusSnapshot["status"],
            reciboNumero: e.reciboNumero,
            erro: e.erro,
            batchId: e.batchId,
          }
        : null
      return serializeReciboRow(row, status)
    })

    return NextResponse.json({
      rows: serialized,
      issues: issues.map(serializeIssue),
      professionals: [...professionals.values()].map((p) => ({
        id: p.id,
        name: p.name,
        fiscalRegime: p.fiscalRegime,
        hasCpf: !!p.cpf,
        hasCrp: !!p.crp,
      })),
    })
  }
)
