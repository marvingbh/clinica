import https from "https"
import { gzipSync } from "zlib"
import { decrypt } from "@/lib/bank-reconciliation/encryption"
import { ADN_URLS } from "./types"

// ============================================================================
// Types
// ============================================================================

export interface AdnConfig {
  certificatePem: string // encrypted
  privateKeyPem: string  // encrypted
  useSandbox: boolean
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

  const body = JSON.stringify({ dpsXmlGZipB64 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { statusCode, data } = await httpsRequest<any>(`${baseUrl}/nfse`, {
    method: "POST",
    agent,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body)

  if (statusCode >= 400) {
    // ADN error responses may use different structures
    const errorMsg = extractAdnError(data, statusCode)
    return { error: errorMsg, statusCode }
  }

  return {
    nfseNumero: data.nfseNumero ?? data.nNFSe,
    chaveAcesso: data.chaveAcesso ?? data.chNFSe,
    codigoVerificacao: data.codigoVerificacao ?? data.cVerif,
    statusCode,
  }
}

// ============================================================================
// cancelNfse — Cancel an existing NFS-e via cancellation event
// ============================================================================

export async function cancelNfse(
  chaveAcesso: string,
  motivo: string,
  codigoMotivo: number,
  config: AdnConfig
): Promise<void> {
  const baseUrl = getBaseUrl(config.useSandbox)
  const agent = createAgent(config)

  const eventXml = buildCancellationEventXml(
    chaveAcesso,
    motivo,
    codigoMotivo
  )
  const eventXmlGZipB64 = compressAndEncode(eventXml)
  const body = JSON.stringify({ pedRegEvtXmlGZipB64: eventXmlGZipB64 })

  const { statusCode, data } = await httpsRequest<{ message?: string }>(
    `${baseUrl}/nfse/${chaveAcesso}/eventos`,
    {
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  )

  if (statusCode >= 400) {
    throw new Error(
      `NFS-e cancellation failed: ${statusCode} ${data.message ?? ""}`
    )
  }
}

function buildCancellationEventXml(
  chaveAcesso: string,
  motivo: string,
  codigoMotivo: number
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">',
    "  <infPedReg>",
    `    <chNFSe>${chaveAcesso}</chNFSe>`,
    "    <tpEvento>e101101</tpEvento>",
    "    <detEvento>",
    `      <cMotCanc>${codigoMotivo}</cMotCanc>`,
    `      <xMotCanc>${motivo}</xMotCanc>`,
    "    </detEvento>",
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
      `${baseUrl}/nfse/${chaveAcesso}/pdf`,
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
