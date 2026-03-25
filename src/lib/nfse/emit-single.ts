/**
 * Shared logic for emitting a single NFS-e via ADN.
 * Used by both per-invoice and per-item emission flows.
 */
import { buildDpsXml } from "./dps-builder"
import { signDpsXml } from "./xml-signer"
import { emitNfse, type AdnConfig } from "./adn-client"
import { decrypt } from "@/lib/bank-reconciliation/encryption"
import { lookupIbgeFromCep } from "./cep-lookup"
import type { NfseEmissionData } from "./types"

export interface EmitSingleParams {
  emissionData: NfseEmissionData
  nfseConfig: {
    cnpj: string
    codigoMunicipio: string
    useSandbox: boolean
    certificatePem: string
    privateKeyPem: string
  }
  adnConfig: AdnConfig
}

export interface EmitSingleResult {
  success: boolean
  nfseNumero?: string | null
  chaveAcesso?: string | null
  codigoVerificacao?: string | null
  nfseXml?: string | null
  error?: string
}

/** Invoice fields needed to build base emission data. */
export interface BaseEmissionInvoice {
  patient: {
    name: string
    billingResponsibleName: string | null
    addressStreet: string | null
    addressNumber: string | null
    addressNeighborhood: string | null
    addressZip: string | null
  }
  clinic: {
    name: string
    email: string | null
    phone: string | null
  }
}

/** NFS-e config fields needed to build base emission data. */
export interface BaseEmissionNfseConfig {
  cnpj: string
  inscricaoMunicipal: string
  regimeTributario: string
  opSimpNac: number
  codigoMunicipio: string
  codigoNbs: string | null
  cClassNbs: string | null
}

/** Optional address override from request body. */
export interface AddressOverride {
  street?: string
  number?: string
  neighborhood?: string
  city?: string
  state?: string
  zip?: string
}

/**
 * Build the base NFS-e emission data that is shared between
 * per-invoice and per-item emission modes (everything except descricao/valor).
 */
export async function buildBaseEmissionData(
  invoice: BaseEmissionInvoice,
  nfseConfig: BaseEmissionNfseConfig,
  effectiveCpf: string,
  billingNameFromBody: string | undefined,
  addressFromBody: AddressOverride | undefined,
  codigoServico: string,
  codigoServicoMunicipal: string | undefined,
  aliquotaIss: number,
): Promise<Omit<NfseEmissionData, "descricao" | "valor">> {
  const tomadorCep = addressFromBody?.zip || invoice.patient.addressZip || ""
  let tomadorCodigoMunicipio: string | null = null
  if (tomadorCep) {
    tomadorCodigoMunicipio = await lookupIbgeFromCep(tomadorCep)
    if (!tomadorCodigoMunicipio) {
      throw new Error(`Não foi possível resolver o município do CEP ${tomadorCep}. Tente novamente.`)
    }
  }

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

let dpsCounter = 0

export async function emitSingleNfse(params: EmitSingleParams): Promise<EmitSingleResult> {
  const { emissionData, nfseConfig, adnConfig } = params

  // Combine timestamp with counter to avoid collisions in per-item batch emissions
  dpsCounter = (dpsCounter + 1) % 1000
  const dpsNumero = (Math.floor(Date.now() / 1000) % 999999) * 1000 + dpsCounter
  const dpsXml = buildDpsXml(emissionData, {
    codigoMunicipio: nfseConfig.codigoMunicipio,
    tpAmb: nfseConfig.useSandbox ? 2 : 1,
    numero: dpsNumero,
  })

  const certPem = decrypt(nfseConfig.certificatePem)
  const keyPem = decrypt(nfseConfig.privateKeyPem)
  const signedXml = signDpsXml(dpsXml, certPem, keyPem)

  const result = await emitNfse(signedXml, adnConfig)

  if (result.error) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    nfseNumero: result.nfseNumero || null,
    chaveAcesso: result.chaveAcesso || null,
    codigoVerificacao: result.codigoVerificacao || null,
    nfseXml: result.nfseXml || null,
  }
}
