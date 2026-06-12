import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { validateCnpj } from "@/lib/nfse"
import { validateCpf } from "@/lib/fiscal"
import { audit, AuditAction } from "@/lib/rbac/audit"

const optionalDigits = (validator: (v: string) => boolean, message: string) =>
  z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 0 || validator(v), { message })
    .optional()
    .or(z.literal(""))

const configSchema = z.object({
  dmedEnabled: z.boolean(),
  cnpj: optionalDigits(validateCnpj, "CNPJ inválido"),
  nomeEmpresarial: z.string().max(200).optional().or(z.literal("")),
  responsavelCpf: optionalDigits(validateCpf, "CPF do responsável inválido"),
  responsavelNome: z.string().max(200).optional().or(z.literal("")),
  responsavelDdd: z.string().max(3).optional().or(z.literal("")),
  responsavelTelefone: z.string().max(20).optional().or(z.literal("")),
})

/** GET — current FiscalConfig + derived flags. ADMIN only (clinic-level data). */
export const GET = withFeatureAuth(
  { feature: "fiscal", minAccess: "READ" },
  async (_req, { user }) => {
    if (user.role !== "ADMIN") return forbiddenResponse("Configuração fiscal é restrita a administradores.")

    const [config, nfse, pfCount] = await Promise.all([
      prisma.fiscalConfig.findUnique({ where: { clinicId: user.clinicId } }),
      prisma.nfseConfig.findUnique({ where: { clinicId: user.clinicId }, select: { cnpj: true } }),
      prisma.professionalProfile.count({
        where: { user: { clinicId: user.clinicId }, fiscalRegime: "PF" },
      }),
    ])

    return NextResponse.json({
      config: config ?? null,
      hasPfProfessionals: pfCount > 0,
      hasNfseCnpj: !!nfse?.cnpj,
      nfseCnpj: nfse?.cnpj ?? null,
    })
  }
)

/** PUT — upsert FiscalConfig by clinicId. ADMIN + fiscal WRITE. */
export const PUT = withFeatureAuth(
  { feature: "fiscal", minAccess: "WRITE" },
  async (req, { user }) => {
    if (user.role !== "ADMIN") return forbiddenResponse("Configuração fiscal é restrita a administradores.")

    const parsed = configSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const d = parsed.data
    const data = {
      dmedEnabled: d.dmedEnabled,
      cnpj: d.cnpj || null,
      nomeEmpresarial: d.nomeEmpresarial || null,
      responsavelCpf: d.responsavelCpf || null,
      responsavelNome: d.responsavelNome || null,
      responsavelDdd: d.responsavelDdd || null,
      responsavelTelefone: d.responsavelTelefone || null,
    }

    const config = await prisma.fiscalConfig.upsert({
      where: { clinicId: user.clinicId },
      create: { clinicId: user.clinicId, ...data },
      update: data,
    })

    await audit.log({
      user,
      action: AuditAction.FISCAL_CONFIG_UPDATED,
      entityType: "FiscalConfig",
      entityId: config.id,
      newValues: { dmedEnabled: data.dmedEnabled },
      request: req,
    })

    return NextResponse.json({ config })
  }
)
