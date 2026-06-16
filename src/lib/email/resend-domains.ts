/**
 * Resend Domains API client (for per-clinic white-label sending domains).
 * Requires a FULL-ACCESS Resend API key (RESEND_API_KEY) — a sending-only
 * (restricted) key returns 401 `restricted_api_key` and surfaces as a clear
 * "full-access key required" error.
 * @see https://resend.com/docs/api-reference/domains
 */
const API = "https://api.resend.com"

export interface ResendDnsRecord {
  record: string
  name: string
  type: string
  ttl?: string
  status?: string
  value: string
  priority?: number
}

export interface ResendDomain {
  id: string
  name: string
  status: string // not_started | pending | verified | failed | temporary_failure
  records: ResendDnsRecord[]
}

export class ResendDomainError extends Error {
  status: number
  restrictedKey: boolean
  constructor(message: string, status: number, restrictedKey = false) {
    super(message)
    this.name = "ResendDomainError"
    this.status = status
    this.restrictedKey = restrictedKey
  }
}

function authHeaders(): Record<string, string> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new ResendDomainError("RESEND_API_KEY não configurada no servidor.", 503)
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
}

async function handle(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const restricted = data?.name === "restricted_api_key"
    const msg = restricted
      ? "A chave Resend atual é restrita a envio. Configure uma chave de ACESSO TOTAL para gerenciar domínios."
      : (data?.message as string) || `Erro Resend (HTTP ${res.status})`
    throw new ResendDomainError(msg, res.status, restricted)
  }
  return data
}

function toDomain(d: Record<string, unknown>): ResendDomain {
  return {
    id: String(d.id),
    name: String(d.name),
    status: String(d.status ?? "pending"),
    records: Array.isArray(d.records) ? (d.records as ResendDnsRecord[]) : [],
  }
}

/** Region: sa-east-1 (São Paulo) by default for Brazilian clinics. */
export async function createResendDomain(name: string, region = "sa-east-1"): Promise<ResendDomain> {
  const res = await fetch(`${API}/domains`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, region }),
  })
  return toDomain(await handle(res))
}

export async function getResendDomain(id: string): Promise<ResendDomain> {
  const res = await fetch(`${API}/domains/${id}`, { headers: authHeaders() })
  return toDomain(await handle(res))
}

/** Triggers verification, then returns the freshly-fetched status + records. */
export async function verifyResendDomain(id: string): Promise<ResendDomain> {
  const res = await fetch(`${API}/domains/${id}/verify`, { method: "POST", headers: authHeaders() })
  await handle(res)
  return getResendDomain(id)
}

export async function deleteResendDomain(id: string): Promise<void> {
  const res = await fetch(`${API}/domains/${id}`, { method: "DELETE", headers: authHeaders() })
  await handle(res)
}
