import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { loadDmedReport, serializeDmedReport, serializeIssue, validateDmedConfig } from "@/lib/fiscal"

/**
 * GET /api/financeiro/fiscal/dmed?year=2025
 * DMED conference report for the year (PJ window). ADMIN only.
 */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (req, { user }) => {
    if (user.role !== "ADMIN") {
      return forbiddenResponse("A conferência DMED é restrita a administradores.")
    }

    const url = new URL(req.url)
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear() - 1

    const [{ report, issues }, config] = await Promise.all([
      loadDmedReport(prisma, user.clinicId, year),
      prisma.fiscalConfig.findUnique({ where: { clinicId: user.clinicId } }),
    ])

    const configErrors = validateDmedConfig({
      cnpj: config?.cnpj ?? undefined,
      nomeEmpresarial: config?.nomeEmpresarial ?? undefined,
      responsavelCpf: config?.responsavelCpf ?? undefined,
      responsavelNome: config?.responsavelNome ?? undefined,
    })

    return NextResponse.json({
      report: serializeDmedReport(report),
      issues: issues.map(serializeIssue),
      configOk: config?.dmedEnabled === true && configErrors.length === 0,
      configErrors,
      dmedEnabled: config?.dmedEnabled === true,
    })
  }
)
