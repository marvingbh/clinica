import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { nfseEmissionOverrideSchema } from "@/lib/nfse"
import { buildNfseDescription } from "@/lib/nfse/description-builder"
import { buildDpsXml } from "@/lib/nfse/dps-builder"
import { signDpsXml } from "@/lib/nfse/xml-signer"
import { emitNfse, type AdnConfig } from "@/lib/nfse/adn-client"
import { decrypt } from "@/lib/bank-reconciliation/encryption"
import type { NfseEmissionData } from "@/lib/nfse/types"

const ALLOWED_STATUSES_FOR_EMISSION = ["PAGO", "ENVIADO"]
const RETRYABLE_NFSE_STATUSES = [null, "ERRO"]

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        patient: { select: { id: true, name: true, cpf: true, billingCpf: true, billingResponsibleName: true, nfseDescriptionTemplate: true, addressStreet: true, addressNumber: true, addressNeighborhood: true, addressZip: true, sessionFee: true } },
        professionalProfile: { select: { user: { select: { name: true } } } },
        clinic: { include: { nfseConfig: true } },
        items: { include: { appointment: { select: { scheduledAt: true } } } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura nao encontrada" }, { status: 404 })
    }

    const nfseConfig = invoice.clinic.nfseConfig
    if (!nfseConfig || !nfseConfig.isActive) {
      return NextResponse.json(
        { error: "Configuracao de NFS-e nao encontrada ou inativa para esta clinica" },
        { status: 400 }
      )
    }

    if (!ALLOWED_STATUSES_FOR_EMISSION.includes(invoice.status)) {
      return NextResponse.json(
        { error: "Fatura deve estar com status PAGO ou ENVIADO para emitir NFS-e" },
        { status: 400 }
      )
    }

    if (!RETRYABLE_NFSE_STATUSES.includes(invoice.nfseStatus)) {
      return NextResponse.json(
        { error: `NFS-e ja esta com status ${invoice.nfseStatus}. Nao e possivel emitir novamente.` },
        { status: 400 }
      )
    }

    // Parse body (overrides + billingCpf)
    let overrides: Record<string, unknown> = {}
    let billingCpfFromBody: string | undefined
    let billingNameFromBody: string | undefined
    let addressFromBody: { street?: string; number?: string; neighborhood?: string; city?: string; state?: string; zip?: string } | undefined
    try {
      const body = await req.json().catch(() => ({}))
      billingCpfFromBody = typeof body.billingCpf === "string" ? body.billingCpf.replace(/\D/g, "") : undefined
      billingNameFromBody = typeof body.billingResponsibleName === "string" ? body.billingResponsibleName.trim() : undefined
      if (body.address && typeof body.address === "object") addressFromBody = body.address
      const parsed = nfseEmissionOverrideSchema.safeParse(body)
      if (parsed.success) {
        overrides = parsed.data as Record<string, unknown>
      }
    } catch {
      // No body is fine — use defaults
    }

    // Determine effective CPF: body override > patient billingCpf > patient cpf
    const effectiveCpf = billingCpfFromBody || invoice.patient.billingCpf || invoice.patient.cpf
    if (!effectiveCpf) {
      return NextResponse.json(
        { error: "Informe o CPF do responsavel financeiro para emitir NFS-e." },
        { status: 400 }
      )
    }

    // Validate address is available (from patient record or from dialog body)
    const hasAddress = addressFromBody?.street || invoice.patient.addressStreet
    if (!hasAddress) {
      return NextResponse.json(
        { error: "Endereco do tomador e obrigatorio para emissao de NFS-e." },
        { status: 400 }
      )
    }

    // Save billing info + address back to patient if provided from the dialog
    const patientUpdates: Record<string, string | null> = {}
    if (billingCpfFromBody && billingCpfFromBody !== (invoice.patient.billingCpf || "")) {
      patientUpdates.billingCpf = billingCpfFromBody
    }
    if (billingNameFromBody && billingNameFromBody !== (invoice.patient.billingResponsibleName || "")) {
      patientUpdates.billingResponsibleName = billingNameFromBody
    }
    if (addressFromBody) {
      if (addressFromBody.street) patientUpdates.addressStreet = addressFromBody.street
      if (addressFromBody.number) patientUpdates.addressNumber = addressFromBody.number
      if (addressFromBody.neighborhood) patientUpdates.addressNeighborhood = addressFromBody.neighborhood
      if (addressFromBody.city) patientUpdates.addressCity = addressFromBody.city
      if (addressFromBody.state) patientUpdates.addressState = addressFromBody.state
      if (addressFromBody.zip) patientUpdates.addressZip = addressFromBody.zip.replace(/\D/g, "")
    }
    if (Object.keys(patientUpdates).length > 0) {
      await prisma.patient.update({
        where: { id: invoice.patient.id },
        data: patientUpdates,
      })
    }

    const codigoServico = (overrides.codigoServico as string | undefined) || nfseConfig.codigoServico
    const codigoServicoMunicipal = nfseConfig.codigoServicoMunicipal || undefined
    // Auto-generate description from appointment data
    const sessionDates = invoice.items
      .filter(item => item.appointment?.scheduledAt)
      .map(item => new Date(item.appointment!.scheduledAt))
    const autoDescription = buildNfseDescription({
      patientName: invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
      billingResponsibleName: invoice.patient.billingResponsibleName,
      professionalName: invoice.professionalProfile.user.name,
      professionalCrp: nfseConfig.professionalCrp || undefined,
      referenceMonth: invoice.referenceMonth,
      referenceYear: invoice.referenceYear,
      sessionDates,
      sessionFee: Number(invoice.patient.sessionFee || invoice.totalAmount),
      taxPercentage: nfseConfig.nfseTaxPercentage ? Number(nfseConfig.nfseTaxPercentage) : undefined,
    }, invoice.patient.nfseDescriptionTemplate || nfseConfig.descricaoServico)
    const descricao = (overrides.descricao as string | undefined) || autoDescription
    const aliquotaIss = (overrides.aliquotaIss as number | undefined) ?? Number(nfseConfig.aliquotaIss)

    // Set PENDENTE as optimistic lock against concurrent emission
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        nfseStatus: "PENDENTE",
        nfseCodigoServico: codigoServico,
        nfseDescricao: descricao,
        nfseAliquotaIss: aliquotaIss,
        nfseErro: null,
      },
    })

    try {
      // 1. Build emission data
      const emissionData: NfseEmissionData = {
        prestadorCnpj: nfseConfig.cnpj,
        prestadorIm: nfseConfig.inscricaoMunicipal,
        prestadorNome: invoice.clinic.name,
        prestadorRegimeTributario: nfseConfig.regimeTributario,
        prestadorOpSimpNac: nfseConfig.opSimpNac,
        prestadorEmail: invoice.clinic.email || undefined,
        prestadorFone: invoice.clinic.phone || undefined,
        tomadorCpf: effectiveCpf,
        tomadorNome: billingNameFromBody || invoice.patient.billingResponsibleName || invoice.patient.name,
        tomadorLogradouro: addressFromBody?.street || invoice.patient.addressStreet || undefined,
        tomadorNumero: addressFromBody?.number || invoice.patient.addressNumber || undefined,
        tomadorBairro: addressFromBody?.neighborhood || invoice.patient.addressNeighborhood || undefined,
        tomadorCep: addressFromBody?.zip || invoice.patient.addressZip || undefined,
        codigoServico,
        codigoServicoMunicipal,
        descricao,
        valor: Number(invoice.totalAmount),
        aliquotaIss,
        codigoMunicipio: nfseConfig.codigoMunicipio,
      }

      // 2. Build DPS XML
      // Use a unique DPS number based on timestamp to avoid duplicates
      const dpsNumero = Math.floor(Date.now() / 1000) % 999999999
      const dpsXml = buildDpsXml(emissionData, {
        codigoMunicipio: nfseConfig.codigoMunicipio,
        tpAmb: nfseConfig.useSandbox ? 2 : 1,
        numero: dpsNumero,
      })

      // 3. Sign XML with A1 certificate
      const certPem = decrypt(nfseConfig.certificatePem)
      const keyPem = decrypt(nfseConfig.privateKeyPem)
      const signedXml = signDpsXml(dpsXml, certPem, keyPem)

      // 4. Call ADN API
      const adnConfig: AdnConfig = {
        certificatePem: nfseConfig.certificatePem,
        privateKeyPem: nfseConfig.privateKeyPem,
        useSandbox: nfseConfig.useSandbox,
      }
      const result = await emitNfse(signedXml, adnConfig)

      if (result.error) {
        // ADN returned an error
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            nfseStatus: "ERRO",
            nfseErro: result.error,
          },
        })

        audit.log({
          user,
          action: AuditAction.NFSE_ERRO,
          entityType: "Invoice",
          entityId: invoice.id,
          newValues: { nfseStatus: "ERRO", erro: result.error },
          request: req,
        }).catch(() => {})

        return NextResponse.json(
          { error: `Erro do ADN: ${result.error}`, nfseStatus: "ERRO" },
          { status: 422 }
        )
      }

      // 5. Success — store NFS-e data
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseStatus: "EMITIDA",
          nfseNumero: result.nfseNumero || null,
          nfseChaveAcesso: result.chaveAcesso || null,
          nfseCodigoVerificacao: result.codigoVerificacao || null,
          nfseEmitidaAt: new Date(),
          nfseErro: null,
          // Keep the legacy field in sync
          notaFiscalEmitida: true,
          notaFiscalEmitidaAt: new Date(),
        },
      })

      audit.log({
        user,
        action: AuditAction.NFSE_EMITIDA,
        entityType: "Invoice",
        entityId: invoice.id,
        newValues: {
          nfseStatus: "EMITIDA",
          nfseNumero: result.nfseNumero,
          nfseChaveAcesso: result.chaveAcesso,
          codigoServico,
          descricao,
        },
        request: req,
      }).catch(() => {})

      return NextResponse.json({
        success: true,
        nfseStatus: "EMITIDA",
        nfseNumero: result.nfseNumero,
        nfseChaveAcesso: result.chaveAcesso,
        nfseCodigoVerificacao: result.codigoVerificacao,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseStatus: "ERRO",
          nfseErro: errorMessage,
        },
      })

      audit.log({
        user,
        action: AuditAction.NFSE_ERRO,
        entityType: "Invoice",
        entityId: invoice.id,
        newValues: { nfseStatus: "ERRO", erro: errorMessage },
        request: req,
      }).catch(() => {})

      return NextResponse.json(
        { error: `Erro ao emitir NFS-e: ${errorMessage}`, nfseStatus: "ERRO" },
        { status: 500 }
      )
    }
  }
)
