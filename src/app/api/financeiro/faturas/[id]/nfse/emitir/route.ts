import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { nfseEmissionOverrideSchema } from "@/lib/nfse"
import { buildNfseDescription } from "@/lib/nfse/description-builder"
import { determineEmissionMode, buildPerItemEmissions, computeAggregateNfseStatus } from "@/lib/nfse/emission-service"
import { emitSingleNfse } from "@/lib/nfse/emit-single"
import type { AdnConfig } from "@/lib/nfse/adn-client"
import type { NfseEmissionData } from "@/lib/nfse/types"
import { lookupIbgeFromCep } from "@/lib/nfse/cep-lookup"

const ALLOWED_STATUSES_FOR_EMISSION = ["PAGO", "ENVIADO"]
const RETRYABLE_NFSE_STATUSES = [null, "ERRO"]

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const url = new URL(req.url)
    const itemId = url.searchParams.get("itemId") // For single-item retry

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        patient: { select: { id: true, name: true, cpf: true, billingCpf: true, billingResponsibleName: true, nfseDescriptionTemplate: true, nfsePerAppointment: true, addressStreet: true, addressNumber: true, addressNeighborhood: true, addressZip: true, sessionFee: true } },
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

    // Determine effective CPF
    const effectiveCpf = billingCpfFromBody || invoice.patient.billingCpf || invoice.patient.cpf
    if (!effectiveCpf) {
      return NextResponse.json(
        { error: "Informe o CPF do responsavel financeiro para emitir NFS-e." },
        { status: 400 }
      )
    }

    // Validate address
    const hasAddress = addressFromBody?.street || invoice.patient.addressStreet
    if (!hasAddress) {
      return NextResponse.json(
        { error: "Endereco do tomador e obrigatorio para emissao de NFS-e." },
        { status: 400 }
      )
    }

    // Save billing info + address back to patient
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
    const aliquotaIss = (overrides.aliquotaIss as number | undefined) ?? Number(nfseConfig.aliquotaIss)

    // Determine emission mode
    const mode = determineEmissionMode(invoice.patient)

    if (mode === "per-item") {
      return handlePerItemEmission({
        invoice, nfseConfig, codigoServico, codigoServicoMunicipal, aliquotaIss,
        effectiveCpf, billingNameFromBody, addressFromBody, overrides,
        user, req, itemId,
      })
    }

    // Per-invoice mode (original behavior)
    return handlePerInvoiceEmission({
      invoice, nfseConfig, codigoServico, codigoServicoMunicipal, aliquotaIss,
      effectiveCpf, billingNameFromBody, addressFromBody, overrides,
      user, req,
    })
  }
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePerInvoiceEmission(ctx: any) {
  const { invoice, nfseConfig, codigoServico, codigoServicoMunicipal, aliquotaIss, effectiveCpf, billingNameFromBody, addressFromBody, overrides, user, req } = ctx

  if (!RETRYABLE_NFSE_STATUSES.includes(invoice.nfseStatus)) {
    return NextResponse.json(
      { error: `NFS-e ja esta com status ${invoice.nfseStatus}. Nao e possivel emitir novamente.` },
      { status: 400 }
    )
  }

  const sessionDates = invoice.items
    .filter((item: { appointment?: { scheduledAt: string } | null }) => item.appointment?.scheduledAt)
    .map((item: { appointment: { scheduledAt: string } }) => new Date(item.appointment.scheduledAt))
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

  // Set PENDENTE
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { nfseStatus: "PENDENTE", nfseCodigoServico: codigoServico, nfseDescricao: descricao, nfseAliquotaIss: aliquotaIss, nfseErro: null },
  })

  try {
    const baseEmission = await buildBaseEmissionData(invoice, nfseConfig, effectiveCpf, billingNameFromBody, addressFromBody, codigoServico, codigoServicoMunicipal, aliquotaIss)
    const emissionData: NfseEmissionData = { ...baseEmission, descricao, valor: Number(invoice.totalAmount) }

    const adnConfig: AdnConfig = { clinicId: user.clinicId, invoiceId: invoice.id, certificatePem: nfseConfig.certificatePem, privateKeyPem: nfseConfig.privateKeyPem, useSandbox: nfseConfig.useSandbox }
    const result = await emitSingleNfse({ emissionData, nfseConfig, adnConfig })

    if (!result.success) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { nfseStatus: "ERRO", nfseErro: result.error } })
      audit.log({ user, action: AuditAction.NFSE_ERRO, entityType: "Invoice", entityId: invoice.id, newValues: { nfseStatus: "ERRO", erro: result.error }, request: req }).catch(() => {})
      return NextResponse.json({ error: `Erro do ADN: ${result.error}`, nfseStatus: "ERRO" }, { status: 422 })
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        nfseStatus: "EMITIDA", nfseNumero: result.nfseNumero, nfseChaveAcesso: result.chaveAcesso,
        nfseCodigoVerificacao: result.codigoVerificacao, nfseXml: result.nfseXml,
        nfseEmitidaAt: new Date(), nfseErro: null, notaFiscalEmitida: true, notaFiscalEmitidaAt: new Date(),
      },
    })

    audit.log({ user, action: AuditAction.NFSE_EMITIDA, entityType: "Invoice", entityId: invoice.id, newValues: { nfseStatus: "EMITIDA", nfseNumero: result.nfseNumero }, request: req }).catch(() => {})
    return NextResponse.json({ success: true, nfseStatus: "EMITIDA", nfseNumero: result.nfseNumero, nfseChaveAcesso: result.chaveAcesso, nfseCodigoVerificacao: result.codigoVerificacao })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
    await prisma.invoice.update({ where: { id: invoice.id }, data: { nfseStatus: "ERRO", nfseErro: errorMessage } })
    audit.log({ user, action: AuditAction.NFSE_ERRO, entityType: "Invoice", entityId: invoice.id, newValues: { nfseStatus: "ERRO", erro: errorMessage }, request: req }).catch(() => {})
    return NextResponse.json({ error: `Erro ao emitir NFS-e: ${errorMessage}`, nfseStatus: "ERRO" }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePerItemEmission(ctx: any) {
  const { invoice, nfseConfig, codigoServico, codigoServicoMunicipal, aliquotaIss, effectiveCpf, billingNameFromBody, addressFromBody, user, req, itemId } = ctx

  const plans = buildPerItemEmissions(invoice.items.map((item: { id: string; type: string; total: unknown; description: string }) => ({
    id: item.id,
    type: item.type,
    total: Number(item.total),
    description: item.description,
  })))

  if (plans.length === 0) {
    return NextResponse.json({ error: "Nenhum item faturavel para emitir NFS-e" }, { status: 400 })
  }

  // If retrying a single item, filter to just that item
  const targetPlans = itemId ? plans.filter(p => p.invoiceItemId === itemId) : plans
  if (itemId && targetPlans.length === 0) {
    return NextResponse.json({ error: "Item nao encontrado na fatura" }, { status: 404 })
  }

  // Create NfseEmission rows for items that don't have one yet (PENDENTE)
  const existingEmissions = await prisma.nfseEmission.findMany({
    where: { invoiceId: invoice.id },
    select: { id: true, invoiceItemId: true, status: true },
  })
  const existingByItemId = new Map(existingEmissions.map(e => [e.invoiceItemId, e]))

  for (const plan of targetPlans) {
    const existing = existingByItemId.get(plan.invoiceItemId)
    if (existing && existing.status !== "ERRO") continue // Don't recreate unless retrying

    if (existing && existing.status === "ERRO") {
      // Reset to PENDENTE for retry
      await prisma.nfseEmission.update({
        where: { id: existing.id },
        data: { status: "PENDENTE", erro: null },
      })
    } else {
      await prisma.nfseEmission.create({
        data: {
          invoiceId: invoice.id,
          invoiceItemId: plan.invoiceItemId,
          status: "PENDENTE",
          descricao: plan.descricao,
          valor: plan.valor,
        },
      })
    }
  }

  // Update invoice aggregate status
  await updateInvoiceAggregateNfseStatus(invoice.id)

  // Now emit each PENDENTE emission sequentially
  const baseEmission = await buildBaseEmissionData(invoice, nfseConfig, effectiveCpf, billingNameFromBody, addressFromBody, codigoServico, codigoServicoMunicipal, aliquotaIss)
  const adnConfig: AdnConfig = { clinicId: user.clinicId, invoiceId: invoice.id, certificatePem: nfseConfig.certificatePem, privateKeyPem: nfseConfig.privateKeyPem, useSandbox: nfseConfig.useSandbox }

  const pendingEmissions = await prisma.nfseEmission.findMany({
    where: {
      invoiceId: invoice.id,
      status: "PENDENTE",
      ...(itemId ? { invoiceItemId: itemId } : {}),
    },
    include: { invoiceItem: { include: { appointment: { select: { scheduledAt: true } } } } },
  })

  const results: Array<{ emissionId: string; success: boolean; error?: string }> = []

  for (const emission of pendingEmissions) {
    // Build per-item description
    const sessionDate = emission.invoiceItem?.appointment?.scheduledAt
    const itemDescription = sessionDate
      ? buildNfseDescription({
          patientName: invoice.patient.name.replace(/\s*\(.*?\)\s*/g, "").trim(),
          billingResponsibleName: invoice.patient.billingResponsibleName,
          professionalName: invoice.professionalProfile.user.name,
          professionalCrp: nfseConfig.professionalCrp || undefined,
          referenceMonth: invoice.referenceMonth,
          referenceYear: invoice.referenceYear,
          sessionDates: [new Date(sessionDate)],
          sessionFee: Number(emission.valor),
          taxPercentage: nfseConfig.nfseTaxPercentage ? Number(nfseConfig.nfseTaxPercentage) : undefined,
        }, invoice.patient.nfseDescriptionTemplate || nfseConfig.descricaoServico)
      : emission.descricao || "Servico de saude"

    const emissionData: NfseEmissionData = { ...baseEmission, descricao: itemDescription, valor: Number(emission.valor) }

    try {
      const result = await emitSingleNfse({ emissionData, nfseConfig, adnConfig })

      if (!result.success) {
        await prisma.nfseEmission.update({
          where: { id: emission.id },
          data: { status: "ERRO", erro: result.error },
        })
        results.push({ emissionId: emission.id, success: false, error: result.error })
      } else {
        await prisma.nfseEmission.update({
          where: { id: emission.id },
          data: {
            status: "EMITIDA",
            numero: result.nfseNumero,
            chaveAcesso: result.chaveAcesso,
            codigoVerificacao: result.codigoVerificacao,
            xml: result.nfseXml,
            descricao: itemDescription,
            emitidaAt: new Date(),
            erro: null,
          },
        })
        results.push({ emissionId: emission.id, success: true })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
      await prisma.nfseEmission.update({
        where: { id: emission.id },
        data: { status: "ERRO", erro: errorMessage },
      })
      results.push({ emissionId: emission.id, success: false, error: errorMessage })
    }
  }

  // Update invoice aggregate status after all emissions
  const aggregateStatus = await updateInvoiceAggregateNfseStatus(invoice.id)

  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  audit.log({
    user,
    action: succeeded > 0 ? AuditAction.NFSE_EMITIDA : AuditAction.NFSE_ERRO,
    entityType: "Invoice",
    entityId: invoice.id,
    newValues: { mode: "per-item", succeeded, failed, aggregateStatus },
    request: req,
  }).catch(() => {})

  return NextResponse.json({
    success: failed === 0,
    mode: "per-item",
    nfseStatus: aggregateStatus,
    results,
    summary: { total: results.length, succeeded, failed },
  })
}

async function updateInvoiceAggregateNfseStatus(invoiceId: string): Promise<string | null> {
  const allEmissions = await prisma.nfseEmission.findMany({
    where: { invoiceId },
    select: { status: true },
  })
  const statuses = allEmissions.map(e => e.status) as Array<"PENDENTE" | "EMITIDA" | "ERRO" | "CANCELADA">
  const aggregate = computeAggregateNfseStatus(statuses)

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      nfseStatus: aggregate,
      // Keep legacy field in sync
      notaFiscalEmitida: aggregate === "EMITIDA",
      notaFiscalEmitidaAt: aggregate === "EMITIDA" ? new Date() : null,
    },
  })
  return aggregate
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildBaseEmissionData(invoice: any, nfseConfig: any, effectiveCpf: string, billingNameFromBody: string | undefined, addressFromBody: any, codigoServico: string, codigoServicoMunicipal: string | undefined, aliquotaIss: number): Promise<Omit<NfseEmissionData, "descricao" | "valor">> {
  const tomadorCep = addressFromBody?.zip || invoice.patient.addressZip || ""
  const tomadorCodigoMunicipio = tomadorCep ? await lookupIbgeFromCep(tomadorCep) : null

  return {
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
    tomadorCodigoMunicipio: tomadorCodigoMunicipio || undefined,
    codigoServico,
    codigoServicoMunicipal,
    codigoNbs: nfseConfig.codigoNbs || undefined,
    cClassNbs: nfseConfig.cClassNbs || undefined,
    aliquotaIss,
    codigoMunicipio: nfseConfig.codigoMunicipio,
  }
}
