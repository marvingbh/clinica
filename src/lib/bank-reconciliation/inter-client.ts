import https from "https"
import { decrypt } from "./encryption"

interface InterTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface InterTransaction {
  idTransacao: string
  dataEntradaContaBancaria: string
  dataLancamento: string
  tipoTransacao: string
  tipoOperacao: string
  valor: string
  titulo: string
  descricao: string
}

interface InterStatementResponse {
  transacoes: InterTransaction[]
}

export interface InterConfig {
  clientId: string
  clientSecret: string // encrypted
  certificate: string  // encrypted PEM
  privateKey: string   // encrypted PEM
}

function createAgent(config: InterConfig): https.Agent {
  const cert = decrypt(config.certificate)
  const key = decrypt(config.privateKey)
  return new https.Agent({ cert, key })
}

async function getAccessToken(config: InterConfig): Promise<string> {
  const agent = createAgent(config)
  const clientSecret = decrypt(config.clientSecret)

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    scope: "extrato.read",
    grant_type: "client_credentials",
  }).toString()

  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
      {
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ""
        res.on("data", (chunk) => (data += chunk))
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Inter OAuth failed: ${res.statusCode} ${data}`))
            return
          }
          const parsed: InterTokenResponse = JSON.parse(data)
          resolve(parsed.access_token)
        })
      }
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

/**
 * Fetch bank statement from Inter API.
 * Date range max 90 days per Inter API limitation.
 */
export async function fetchStatements(
  config: InterConfig,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<Array<{
  externalId: string
  date: string
  amount: number
  description: string
  payerName: string | null
  type: "CREDIT" | "DEBIT"
}>> {
  const token = await getAccessToken(config)
  const agent = createAgent(config)

  const url = `https://cdpj.partners.bancointer.com.br/banking/v2/extrato?dataInicio=${startDate}&dataFim=${endDate}`

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "GET",
      agent,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Inter statement fetch failed: ${res.statusCode} ${data}`))
          return
        }
        const parsed: InterStatementResponse = JSON.parse(data)
        const transactions = (parsed.transacoes || []).map(tx => ({
          externalId: tx.idTransacao,
          date: tx.dataLancamento || tx.dataEntradaContaBancaria,
          amount: parseFloat(tx.valor),
          description: tx.descricao || tx.titulo || "",
          payerName: extractPayerName(tx.descricao || tx.titulo || ""),
          type: (tx.tipoOperacao === "C" ? "CREDIT" : "DEBIT") as "CREDIT" | "DEBIT",
        }))
        resolve(transactions)
      })
    })
    req.on("error", reject)
    req.end()
  })
}

/**
 * Extract payer name from PIX description.
 * Inter PIX descriptions typically contain the sender's name.
 */
function extractPayerName(description: string): string | null {
  if (!description) return null
  // Try to extract name from common Inter PIX formats
  const match = description.match(/PIX\s*[-–]?\s*(.+?)(?:\s*[-–]\s*\d|$)/i)
  if (match?.[1]) {
    const name = match[1].trim()
    if (name && !/^\d+$/.test(name)) return name
  }
  return description.trim() || null
}
