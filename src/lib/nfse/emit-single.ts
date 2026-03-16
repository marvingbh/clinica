/**
 * Shared logic for emitting a single NFS-e via ADN.
 * Used by both per-invoice and per-item emission flows.
 */
import { buildDpsXml } from "./dps-builder"
import { signDpsXml } from "./xml-signer"
import { emitNfse, type AdnConfig } from "./adn-client"
import { decrypt } from "@/lib/bank-reconciliation/encryption"
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

export async function emitSingleNfse(params: EmitSingleParams): Promise<EmitSingleResult> {
  const { emissionData, nfseConfig, adnConfig } = params

  const dpsNumero = Math.floor(Date.now() / 1000) % 999999999
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
