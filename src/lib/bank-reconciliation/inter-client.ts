import https from "https"
import crypto from "crypto"
import { decrypt } from "./encryption"

interface InterTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface InterTransaction {
  dataEntrada: string      // "2026-03-08"
  tipoTransacao: string    // "PIX", "TED", etc.
  tipoOperacao: string     // "C" (credit) or "D" (debit)
  valor: string            // "1400.0"
  titulo: string           // "Pix recebido"
  descricao: string        // "PIX RECEBIDO - Cp :00000000-ADRIANA MC SIQUEIRA"
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

// In-memory token cache per clientId
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getAccessToken(config: InterConfig): Promise<string> {
  const cached = tokenCache.get(config.clientId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

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
          let parsed: InterTokenResponse
          try {
            parsed = JSON.parse(data)
          } catch {
            reject(new Error(`Inter OAuth returned invalid JSON: ${data.slice(0, 200)}`))
            return
          }
          // Cache with 60s safety margin
          tokenCache.set(config.clientId, {
            token: parsed.access_token,
            expiresAt: Date.now() + (parsed.expires_in - 60) * 1000,
          })
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
 * Fetch current account balance from Inter API.
 */
export async function fetchBalance(config: InterConfig): Promise<number> {
  const token = await getAccessToken(config)
  const agent = createAgent(config)
  const today = new Date().toISOString().split("T")[0]

  const url = `https://cdpj.partners.bancointer.com.br/banking/v2/saldo?dataSaldo=${today}`

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
          reject(new Error(`Inter balance fetch failed: ${res.statusCode} ${data}`))
          return
        }
        try {
          const parsed = JSON.parse(data)
          // Inter returns { disponivel: number } or { bloqueado, disponivel, ... }
          const balance = parsed.disponivel ?? parsed.saldo ?? 0
          resolve(typeof balance === "string" ? parseFloat(balance) : balance)
        } catch {
          reject(new Error(`Inter balance returned invalid JSON: ${data.slice(0, 200)}`))
        }
      })
    })
    req.on("error", reject)
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
        let parsed: { transacoes: InterTransaction[] }
        try {
          parsed = JSON.parse(data)
        } catch {
          reject(new Error(`Inter statement returned invalid JSON: ${data.slice(0, 200)}`))
          return
        }
        const rawList = parsed.transacoes || []
        // Build stable externalIds from transaction content (not array index)
        const keyCounts = new Map<string, number>()
        const transactions = rawList.map((tx) => {
          const amount = parseFloat(tx.valor)
          const desc = (tx.descricao || tx.titulo || "").trim()
          const contentHash = crypto.createHash("md5").update(desc).digest("hex").slice(0, 10)
          const baseKey = `${tx.dataEntrada}-${amount}-${contentHash}`
          const seq = keyCounts.get(baseKey) || 0
          keyCounts.set(baseKey, seq + 1)
          const externalId = seq === 0 ? baseKey : `${baseKey}-${seq}`
          return {
            externalId,
            date: tx.dataEntrada,
            amount,
            description: desc,
            payerName: extractPayerName(desc),
            type: (tx.tipoOperacao === "C" ? "CREDIT" : "DEBIT") as "CREDIT" | "DEBIT",
          }
        })
        resolve(transactions)
      })
    })
    req.on("error", reject)
    req.end()
  })
}

/**
 * Extract payer name from Inter transaction description.
 * Known formats:
 * - "PIX RECEBIDO - Cp :00000000-ADRIANA MC SIQUEIRA"
 * - "PIX RECEBIDO INTERNO - 00019 7258666 SAVIO MOREIRA"
 */
export function extractPayerName(description: string): string | null {
  if (!description) return null
  // "PIX RECEBIDO - Cp :12345678-NOME COMPLETO"
  const cpfMatch = description.match(/Cp\s*:\d+-(.+)$/i)
  if (cpfMatch?.[1]) {
    return cpfMatch[1].trim()
  }
  // "PIX RECEBIDO INTERNO - 00019 7258666 NOME COMPLETO"
  // Name comes after the numeric codes following the dash
  const internalMatch = description.match(/-\s*[\d\s]+\s+([A-Z][A-Z\s]+)$/i)
  if (internalMatch?.[1]) {
    return internalMatch[1].trim()
  }
  // Fallback: try after last dash
  const dashMatch = description.match(/-([A-Z][A-Z\s]+)$/i)
  if (dashMatch?.[1]) {
    return dashMatch[1].trim()
  }
  return null
}
