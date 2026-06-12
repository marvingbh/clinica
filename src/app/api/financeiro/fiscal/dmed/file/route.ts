import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { loadDmedReport, buildDmedFile, validateDmedConfig, type DmedConfig } from "@/lib/fiscal"

/**
 * GET /api/financeiro/fiscal/dmed/file?year=2025
 * Returns the DMED text file as a download. ADMIN only. 422 with a pt-BR error
 * list when the fiscal config is incomplete.
 */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (req, { user }) => {
    if (user.role !== "ADMIN") {
      return forbiddenResponse("A conferência DMED é restrita a administradores.")
    }

    const url = new URL(req.url)
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear() - 1

    const config = await prisma.fiscalConfig.findUnique({ where: { clinicId: user.clinicId } })
    const errors = validateDmedConfig({
      cnpj: config?.cnpj ?? undefined,
      nomeEmpresarial: config?.nomeEmpresarial ?? undefined,
      responsavelCpf: config?.responsavelCpf ?? undefined,
      responsavelNome: config?.responsavelNome ?? undefined,
    })
    if (errors.length > 0) {
      return NextResponse.json({ error: "Configuração fiscal incompleta", errors }, { status: 422 })
    }

    const { report } = await loadDmedReport(prisma, user.clinicId, year)
    const dmedConfig: DmedConfig = {
      cnpj: config!.cnpj!,
      nomeEmpresarial: config!.nomeEmpresarial!,
      responsavelCpf: config!.responsavelCpf!,
      responsavelNome: config!.responsavelNome!,
      responsavelDdd: config!.responsavelDdd,
      responsavelTelefone: config!.responsavelTelefone,
    }
    const content = buildDmedFile(report, dmedConfig)

    await audit.log({
      user,
      action: AuditAction.DMED_FILE_DOWNLOADED,
      entityType: "FiscalConfig",
      entityId: config!.id,
      newValues: { year, payers: report.payers.length, grandTotal: report.grandTotal },
      request: req,
    })

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="dmed-${year}.txt"`,
      },
    })
  }
)
