import { maskCpf } from "./cpf"

export type OtpOutcome = "sent" | "verified" | "failed"

export interface ViewEvent {
  at: string // ISO
  ip?: string
  userAgent?: string
}

export interface OtpEvent {
  at: string // ISO
  channel: string // NotificationChannel
  outcome: OtpOutcome
}

/**
 * Advanced-electronic-signature evidence (Lei 14.063/2020). Stored as JSON on
 * the SignatureRequest. Never exposed on public routes.
 */
export interface SignatureEvidence {
  sentAt?: string
  sentChannel?: string
  viewEvents: ViewEvent[]
  otpEvents: OtpEvent[]
  signedAt?: string
  signerIp?: string
  signerUserAgent?: string
  originalSha256: string
  countersigned: boolean
}

export function emptyEvidence(originalSha256: string): SignatureEvidence {
  return {
    viewEvents: [],
    otpEvents: [],
    originalSha256,
    countersigned: false,
  }
}

/** Tolerant parse: accepts `{}`, partial, or corrupted JSON without throwing. */
export function parseEvidence(json: unknown): SignatureEvidence {
  const base = emptyEvidence("")
  if (!json || typeof json !== "object") return base
  const o = json as Record<string, unknown>
  return {
    sentAt: typeof o.sentAt === "string" ? o.sentAt : undefined,
    sentChannel: typeof o.sentChannel === "string" ? o.sentChannel : undefined,
    viewEvents: Array.isArray(o.viewEvents) ? (o.viewEvents as ViewEvent[]) : [],
    otpEvents: Array.isArray(o.otpEvents) ? (o.otpEvents as OtpEvent[]) : [],
    signedAt: typeof o.signedAt === "string" ? o.signedAt : undefined,
    signerIp: typeof o.signerIp === "string" ? o.signerIp : undefined,
    signerUserAgent: typeof o.signerUserAgent === "string" ? o.signerUserAgent : undefined,
    originalSha256: typeof o.originalSha256 === "string" ? o.originalSha256 : "",
    countersigned: o.countersigned === true,
  }
}

/** Records that the link was sent. Returns a new object (does not mutate). */
export function markSent(
  ev: SignatureEvidence,
  at: Date,
  channel: string
): SignatureEvidence {
  return { ...ev, sentAt: at.toISOString(), sentChannel: channel }
}

/** Appends a view event immutably. */
export function appendViewEvent(
  ev: SignatureEvidence,
  at: Date,
  ip?: string,
  userAgent?: string
): SignatureEvidence {
  const event: ViewEvent = { at: at.toISOString() }
  if (ip) event.ip = ip
  if (userAgent) event.userAgent = userAgent
  return { ...ev, viewEvents: [...ev.viewEvents, event] }
}

/** Appends an OTP event immutably. */
export function appendOtpEvent(
  ev: SignatureEvidence,
  at: Date,
  channel: string,
  outcome: OtpOutcome
): SignatureEvidence {
  const event: OtpEvent = { at: at.toISOString(), channel, outcome }
  return { ...ev, otpEvents: [...ev.otpEvents, event] }
}

/** Records the final signing event immutably. */
export function finalizeEvidence(
  ev: SignatureEvidence,
  args: { signedAt: Date; ip?: string; userAgent?: string; countersigned: boolean }
): SignatureEvidence {
  return {
    ...ev,
    signedAt: args.signedAt.toISOString(),
    signerIp: args.ip,
    signerUserAgent: args.userAgent,
    countersigned: args.countersigned,
  }
}

function fmt(iso: string | undefined, tz: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  const date = d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" })
  const time = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
  return `${date} ${time}`
}

const ROLE_LABELS: Record<string, string> = {
  PACIENTE: "Paciente",
  RESPONSAVEL: "Responsável",
}

/** Builds pt-BR evidence summary lines for the signature page / staff timeline. */
export function buildEvidenceSummaryLines(
  ev: SignatureEvidence,
  signer: { name: string; cpf: string | null; role: string },
  tz: string
): string[] {
  const lines: string[] = []
  lines.push(`Signatário: ${signer.name} (${ROLE_LABELS[signer.role] ?? signer.role})`)
  if (signer.cpf) lines.push(`CPF: ${maskCpf(signer.cpf)}`)
  if (ev.sentAt) lines.push(`Enviado em: ${fmt(ev.sentAt, tz)}${ev.sentChannel ? ` (${ev.sentChannel})` : ""}`)
  const firstView = ev.viewEvents[0]
  if (firstView) lines.push(`Visualizado em: ${fmt(firstView.at, tz)}${firstView.ip ? ` — IP ${firstView.ip}` : ""}`)
  const verified = ev.otpEvents.find((e) => e.outcome === "verified")
  if (verified) lines.push(`Código verificado em: ${fmt(verified.at, tz)} (${verified.channel})`)
  if (ev.signedAt) lines.push(`Assinado em: ${fmt(ev.signedAt, tz)}${ev.signerIp ? ` — IP ${ev.signerIp}` : ""}`)
  lines.push(`Contra-assinatura ICP-Brasil: ${ev.countersigned ? "Sim" : "Não"}`)
  return lines
}
