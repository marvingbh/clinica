import { NextResponse } from "next/server"
import type { AuthUser } from "@/lib/rbac"
import { professionalBelongsToClinic } from "@/lib/clinic/ownership"
import { parseReportQuery } from "./query"
import { resolvePeriod } from "./period"
import type { ReportScope } from "./fetch-shared"
import type { PeriodInput } from "./types"
import type { ReportFormat } from "./query"

export interface ResolvedReportRequest {
  scope: ReportScope
  period: PeriodInput
  format: ReportFormat
  /** ADMIN clinic-scope includes colleague revenue; own-scope does not. */
  includeRevenue: boolean
}

/**
 * Parse the query, enforce tenant + role scope, and resolve the date range.
 * Returns a NextResponse on validation/ownership failure (400/404).
 *
 * PROFESSIONAL is forced to own-scope: the request's professionalId is ignored
 * and never returns colleagues' data. ADMIN may filter by a clinic professional.
 */
export async function resolveReportRequest(
  url: string,
  user: AuthUser
): Promise<ResolvedReportRequest | NextResponse> {
  const parsed = parseReportQuery(new URL(url).searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const isAdmin = user.role === "ADMIN"
  let professionalId: string | null

  if (!isAdmin) {
    professionalId = user.professionalProfileId // request param ignored
  } else if (parsed.professionalId) {
    const ok = await professionalBelongsToClinic(parsed.professionalId, user.clinicId)
    if (!ok) {
      return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 })
    }
    professionalId = parsed.professionalId
  } else {
    professionalId = null
  }

  return {
    scope: {
      clinicId: user.clinicId,
      professionalProfileId: professionalId,
      range: resolvePeriod(parsed.period),
    },
    period: parsed.period,
    format: parsed.format,
    includeRevenue: isAdmin,
  }
}

/** Build a text/csv NextResponse with a pt-BR-friendly attachment filename. */
export function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
