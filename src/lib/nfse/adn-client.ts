import https from "https"
import { gzipSync, gunzipSync } from "zlib"
import { decrypt } from "@/lib/bank-reconciliation/encryption"
import { ADN_URLS } from "./types"
import { logAdnCall } from "./adn-logger"

// ============================================================================
// Types
// ============================================================================

export interface AdnConfig {
  certificatePem: string // encrypted
  privateKeyPem: string  // encrypted
  useSandbox: boolean
  clinicId: string       // for logging
  invoiceId?: string     // for logging
}

export interface NfseResponse {
  nfseNumero?: string
  chaveAcesso?: string
  codigoVerificacao?: string
  error?: string
  statusCode?: number
}

// ============================================================================
// Helpers
// ============================================================================

function getBaseUrl(useSandbox: boolean): string {
  return useSandbox ? ADN_URLS.sandbox : ADN_URLS.production
}

function createAgent(config: AdnConfig): https.Agent {
  const cert = decrypt(config.certificatePem)
  const key = decrypt(config.privateKeyPem)
  return new https.Agent({ cert, key })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAdnError(data: any, statusCode: number): string {
  // ADN uses ListaMensagemRetorno with Codigo/Mensagem/Correcao
  if (data?.ListaMensagemRetorno?.length) {
    return data.ListaMensagemRetorno
      .map((m: { Codigo?: string; Mensagem?: string; Correcao?: string }) =>
        `[${m.Codigo || "?"}] ${m.Mensagem || "Erro desconhecido"}${m.Correcao ? ` — ${m.Correcao}` : ""}`
      )
      .join("; ")
  }
  // Some errors come as { message } or { error }
  if (data?.message) return data.message
  if (data?.error) return data.error
  // Fallback: stringify what we got
  if (typeof data === "object") {
    const raw = JSON.stringify(data).slice(0, 500)
    return `HTTP ${statusCode}: ${raw}`
  }
  return `HTTP ${statusCode}`
}

function compressAndEncode(xml: string): string {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"))
  return gzipped.toString("base64")
}

function httpsRequest<T>(
  url: string,
  options: https.RequestOptions,
  body?: string
): Promise<{ statusCode: number; data: T }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        let parsed: T
        try {
          parsed = JSON.parse(data) as T
        } catch {
          // Non-JSON response — wrap as error object
          parsed = { message: `Resposta nao-JSON do ADN: ${data.slice(0, 500)}` } as T
        }
        resolve({ statusCode: res.statusCode ?? 0, data: parsed })
      })
    })
    req.on("error", reject)
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

// ============================================================================
// emitNfse — Submit signed DPS XML for NFS-e emission
// ============================================================================

export async function emitNfse(
  signedDpsXml: string,
  config: AdnConfig
): Promise<NfseResponse> {
  const baseUrl = getBaseUrl(config.useSandbox)
  const agent = createAgent(config)
  const dpsXmlGZipB64 = compressAndEncode(signedDpsXml)
  const url = `${baseUrl}/nfse`
  const body = JSON.stringify({ dpsXmlGZipB64 })
  const start = Date.now()

  let statusCode: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any
  let rawResponse: string

  try {
    const result = await httpsRequest<Record<string, unknown>>(url, {
      method: "POST",
      agent,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, body)
    statusCode = result.statusCode
    data = result.data
    rawResponse = JSON.stringify(data)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logAdnCall({ clinicId: config.clinicId, invoiceId: config.invoiceId, operation: "emit", method: "POST", url, requestBody: signedDpsXml, error: errMsg, durationMs: Date.now() - start })
    throw err
  }

  logAdnCall({
    clinicId: config.clinicId, invoiceId: config.invoiceId, operation: "emit", method: "POST", url,
    requestBody: signedDpsXml, statusCode, responseBody: rawResponse.slice(0, 50000), durationMs: Date.now() - start,
    error: statusCode >= 400 ? extractAdnError(data, statusCode) : undefined,
  })

  if (statusCode >= 400) {
    return { error: extractAdnError(data, statusCode), statusCode }
  }

  const chaveAcesso = data.chaveAcesso ?? data.idDps ?? ""
  let nfseNumero: string | undefined
  let codigoVerificacao: string | undefined

  if (data.nfseXmlGZipB64) {
    try {
      const xmlBuffer = gunzipSync(Buffer.from(data.nfseXmlGZipB64 as string, "base64"))
      const nfseXml = xmlBuffer.toString("utf-8")
      const nNFSeMatch = nfseXml.match(/<nNFSe>([^<]+)<\/nNFSe>/)
      if (nNFSeMatch) nfseNumero = nNFSeMatch[1]
      const cVerifMatch = nfseXml.match(/<cVerif>([^<]+)<\/cVerif>/)
      if (cVerifMatch) codigoVerificacao = cVerifMatch[1]
    } catch {
      // Could not parse XML — proceed with chaveAcesso only
    }
  }

  return { nfseNumero, chaveAcesso, codigoVerificacao, statusCode }
}

// ============================================================================
// cancelNfse — Cancel an existing NFS-e via cancellation event
// ============================================================================

export async function cancelNfse(
  chaveAcesso: string,
  motivo: string,
  codigoMotivo: number,
  cnpjAutor: string,
  config: AdnConfig
): Promise<void> {
  const baseUrl = getBaseUrl(config.useSandbox)
  const agent = createAgent(config)
  const cert = decrypt(config.certificatePem)
  const key = decrypt(config.privateKeyPem)

  const tpAmb = config.useSandbox ? 2 : 1
  const eventXml = buildCancellationEventXml(chaveAcesso, motivo, codigoMotivo, cnpjAutor, tpAmb as 1 | 2)

  // Sign the event XML
  const { SignedXml } = await import("xml-crypto")
  const sig = new SignedXml({ privateKey: key, publicCert: cert, canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#", signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" })
  sig.addReference({ xpath: "//*[local-name(.)='infPedReg']", digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"] })
  sig.computeSignature(eventXml, { location: { reference: "//*[local-name(.)='pedRegEvento']", action: "append" } })
  const signedXml = sig.getSignedXml()

  const eventXmlGZipB64 = compressAndEncode(signedXml)
  const url = `${baseUrl}/nfse/${chaveAcesso}/eventos`
  const body = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: eventXmlGZipB64 })
  const start = Date.now()

  let statusCode: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any
  try {
    const result = await httpsRequest<Record<string, unknown>>(url, {
      method: "POST", agent,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, body)
    statusCode = result.statusCode
    data = result.data
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logAdnCall({ clinicId: config.clinicId, invoiceId: config.invoiceId, operation: "cancel", method: "POST", url, requestBody: signedXml, error: errMsg, durationMs: Date.now() - start })
    throw err
  }

  const rawResponse = JSON.stringify(data)
  const errorMsg = statusCode >= 400 ? (typeof data === "object" ? extractAdnError(data, statusCode) : `HTTP ${statusCode}`) : undefined

  logAdnCall({
    clinicId: config.clinicId, invoiceId: config.invoiceId, operation: "cancel", method: "POST", url,
    requestBody: signedXml, statusCode, responseBody: rawResponse, durationMs: Date.now() - start, error: errorMsg,
  })

  if (statusCode >= 400) {
    throw new Error(`NFS-e cancellation failed: ${errorMsg}`)
  }
}

function buildCancellationEventXml(
  chaveAcesso: string,
  motivo: string,
  codigoMotivo: number,
  cnpjAutor: string,
  tpAmb: 1 | 2
): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const dhEvento = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}-03:00`
  // Id = PRE + chNFSe(50) + tpEvento(6) = 59 chars (nPedRegEvento removed from Id as of Jan/2026)
  const id = `PRE${chaveAcesso}101101`

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">',
    `  <infPedReg Id="${id}">`,
    `    <tpAmb>${tpAmb}</tpAmb>`,
    "    <verAplic>CLINICA1.0</verAplic>",
    `    <dhEvento>${dhEvento}</dhEvento>`,
    `    <CNPJAutor>${cnpjAutor}</CNPJAutor>`,
    `    <chNFSe>${chaveAcesso}</chNFSe>`,
    "    <e101101>",
    "      <xDesc>Cancelamento de NFS-e</xDesc>",
    `      <cMotivo>${codigoMotivo}</cMotivo>`,
    `      <xMotivo>${motivo}</xMotivo>`,
    "    </e101101>",
    "  </infPedReg>",
    "</pedRegEvento>",
  ].join("\n")
}

// ============================================================================
// consultaNfse — Query an existing NFS-e by chaveAcesso
// ============================================================================

export async function consultaNfse(
  chaveAcesso: string,
  config: AdnConfig
): Promise<NfseResponse> {
  const baseUrl = getBaseUrl(config.useSandbox)
  const agent = createAgent(config)

  const { statusCode, data } = await httpsRequest<{
    nfseNumero?: string
    chaveAcesso?: string
    codigoVerificacao?: string
    message?: string
  }>(`${baseUrl}/nfse/${chaveAcesso}`, {
    method: "GET",
    agent,
    headers: { "Content-Type": "application/json" },
  })

  if (statusCode >= 400) {
    return {
      error: data.message ?? `HTTP ${statusCode}`,
      statusCode,
    }
  }

  return {
    nfseNumero: data.nfseNumero,
    chaveAcesso: data.chaveAcesso,
    codigoVerificacao: data.codigoVerificacao,
    statusCode,
  }
}

// ============================================================================
// fetchDanfse — Download the DANFSE PDF
// ============================================================================

export async function fetchDanfse(
  chaveAcesso: string,
  config: AdnConfig
): Promise<Buffer> {
  const baseUrl = getBaseUrl(config.useSandbox)
  const agent = createAgent(config)

  return new Promise((resolve, reject) => {
    const req = https.request(
      `${config.useSandbox ? "https://adn.producaorestrita.nfse.gov.br" : "https://adn.nfse.gov.br"}/danfse/${chaveAcesso}`,
      {
        method: "GET",
        agent,
        headers: { Accept: "application/pdf" },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          const buffer = Buffer.concat(chunks)
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `DANFSE fetch failed: ${res.statusCode} ${buffer.toString("utf-8").slice(0, 200)}`
              )
            )
            return
          }
          resolve(buffer)
        })
      }
    )
    req.on("error", reject)
    req.end()
  })
}
