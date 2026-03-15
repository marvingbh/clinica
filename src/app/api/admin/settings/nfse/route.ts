import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { encrypt } from "@/lib/bank-reconciliation"
import { nfseConfigSchema } from "@/lib/nfse"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { extractPemFromPfx } from "./pfx-helper"

/**
 * GET /api/admin/settings/nfse
 * Returns NFS-e config (without decrypted certificate PEM values).
 */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (req, { user }) => {
    const config = await prisma.nfseConfig.findUnique({
      where: { clinicId: user.clinicId },
    })

    if (!config) {
      return NextResponse.json({ config: null })
    }

    // Strip encrypted PEM fields — never expose them
    const { certificatePem, privateKeyPem, ...safeConfig } = config
    return NextResponse.json({
      config: {
        ...safeConfig,
        aliquotaIss: Number(safeConfig.aliquotaIss),
        hasCertificate: !!certificatePem,
      },
    })
  }
)

/**
 * POST /api/admin/settings/nfse
 * Create or update NFS-e configuration (multipart/form-data).
 *
 * Fields:
 *   - config: JSON string matching nfseConfigSchema
 *   - certificate (optional): .pfx / .p12 file
 *   - certificatePassword: password for the PFX file
 */
export const POST = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json(
        { error: "Requisição deve ser multipart/form-data" },
        { status: 400 }
      )
    }

    const configJson = formData.get("config") as string | null
    if (!configJson) {
      return NextResponse.json(
        { error: "Campo 'config' é obrigatório" },
        { status: 400 }
      )
    }

    let rawConfig: unknown
    try {
      rawConfig = JSON.parse(configJson)
    } catch {
      return NextResponse.json(
        { error: "JSON inválido no campo 'config'" },
        { status: 400 }
      )
    }

    const parsed = nfseConfigSchema.safeParse(rawConfig)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const data = parsed.data

    // Build upsert payload (without certificate fields initially)
    const upsertData = {
      cnpj: data.cnpj,
      inscricaoMunicipal: data.inscricaoMunicipal,
      codigoMunicipio: data.codigoMunicipio,
      regimeTributario: data.regimeTributario,
      codigoServico: data.codigoServico,
      cnae: data.cnae ?? null,
      codigoNbs: data.codigoNbs ?? null,
      aliquotaIss: data.aliquotaIss,
      descricaoServico: data.descricaoServico ?? null,
      useSandbox: data.useSandbox,
      isActive: true,
    }

    // Process PFX certificate if provided
    const certificateFile = formData.get("certificate") as File | null
    const certificatePassword = formData.get("certificatePassword") as string | null

    let certificateFields: { certificatePem: string; privateKeyPem: string } | null = null

    if (certificateFile && certificateFile.size > 0) {
      if (!certificatePassword) {
        return NextResponse.json(
          { error: "Senha do certificado é obrigatória quando um certificado é enviado" },
          { status: 400 }
        )
      }

      try {
        const pfxBuffer = Buffer.from(await certificateFile.arrayBuffer())
        const pem = extractPemFromPfx(pfxBuffer, certificatePassword)
        certificateFields = {
          certificatePem: encrypt(pem.certificate),
          privateKeyPem: encrypt(pem.privateKey),
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao processar certificado"
        return NextResponse.json(
          { error: `Falha ao extrair certificado: ${message}` },
          { status: 400 }
        )
      }
    }

    // On create, certificate is mandatory
    const existing = await prisma.nfseConfig.findUnique({
      where: { clinicId: user.clinicId },
      select: { id: true },
    })

    if (!existing && !certificateFields) {
      return NextResponse.json(
        { error: "Certificado digital é obrigatório na primeira configuração" },
        { status: 400 }
      )
    }

    const config = await prisma.nfseConfig.upsert({
      where: { clinicId: user.clinicId },
      create: {
        clinicId: user.clinicId,
        ...upsertData,
        certificatePem: certificateFields!.certificatePem,
        privateKeyPem: certificateFields!.privateKeyPem,
      },
      update: {
        ...upsertData,
        ...(certificateFields ?? {}),
      },
    })

    audit
      .log({
        user,
        action: AuditAction.NFSE_CONFIG_UPDATED,
        entityType: "NfseConfig",
        entityId: config.id,
        newValues: {
          cnpj: data.cnpj,
          codigoMunicipio: data.codigoMunicipio,
          codigoServico: data.codigoServico,
          useSandbox: data.useSandbox,
          certificateUpdated: !!certificateFields,
        },
        request: req,
      })
      .catch(() => {})

    // Return sanitized config
    const { certificatePem, privateKeyPem, ...safeConfig } = config
    return NextResponse.json(
      {
        config: {
          ...safeConfig,
          aliquotaIss: Number(safeConfig.aliquotaIss),
          hasCertificate: !!certificatePem,
        },
      },
      { status: existing ? 200 : 201 }
    )
  }
)

/**
 * DELETE /api/admin/settings/nfse
 * Remove NFS-e configuration for the clinic.
 */
export const DELETE = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    const existing = await prisma.nfseConfig.findUnique({
      where: { clinicId: user.clinicId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Configuração NFS-e não encontrada" },
        { status: 404 }
      )
    }

    await prisma.nfseConfig.delete({
      where: { clinicId: user.clinicId },
    })

    audit
      .log({
        user,
        action: AuditAction.NFSE_CONFIG_UPDATED,
        entityType: "NfseConfig",
        entityId: existing.id,
        oldValues: { deleted: true },
        request: req,
      })
      .catch(() => {})

    return NextResponse.json({ success: true })
  }
)
