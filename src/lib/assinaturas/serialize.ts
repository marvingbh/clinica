import { maskCpf } from "./cpf"
import { maskContact } from "./otp"
import { parseEvidence, buildEvidenceSummaryLines } from "./evidence"

// ---- Input shapes (subset of Prisma models) ----

export interface RequestRow {
  id: string
  signerName: string
  signerCpf: string | null
  signerEmail: string | null
  signerPhone: string | null
  role: string
  signingOrder: number
  status: string
  expiresAt: Date
  viewedAt: Date | null
  signedAt: Date | null
  declinedAt: Date | null
  declineReason: string | null
  otpChannel: string | null
  linkSentAt: Date | null
  evidence: unknown
}

export interface EnvelopeRow {
  id: string
  status: string
  documentId: string
  patientId: string
  verificationCode: string | null
  signedSha256: string | null
  originalSha256: string
  countersignedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}

// ---- Staff DTOs ----

export interface EnvelopeListItem {
  id: string
  status: string
  documentId: string
  patientId: string
  createdAt: string
  completedAt: string | null
  verificationCode: string | null
  signers: {
    id: string
    name: string
    role: string
    signingOrder: number
    status: string
    expiresAt: string
  }[]
}

export function toEnvelopeListItem(envelope: EnvelopeRow, requests: RequestRow[]): EnvelopeListItem {
  return {
    id: envelope.id,
    status: envelope.status,
    documentId: envelope.documentId,
    patientId: envelope.patientId,
    createdAt: envelope.createdAt.toISOString(),
    completedAt: envelope.completedAt?.toISOString() ?? null,
    verificationCode: envelope.verificationCode,
    signers: [...requests]
      .sort((a, b) => a.signingOrder - b.signingOrder)
      .map((r) => ({
        id: r.id,
        name: r.signerName,
        role: r.role,
        signingOrder: r.signingOrder,
        status: r.status,
        expiresAt: r.expiresAt.toISOString(),
      })),
  }
}

export interface EnvelopeDetail extends EnvelopeListItem {
  signedSha256: string | null
  originalSha256: string
  countersignedAt: string | null
  timeline: { signerId: string; signerName: string; lines: string[] }[]
}

export function toEnvelopeDetail(
  envelope: EnvelopeRow,
  requests: RequestRow[],
  tz: string
): EnvelopeDetail {
  const base = toEnvelopeListItem(envelope, requests)
  return {
    ...base,
    signedSha256: envelope.signedSha256,
    originalSha256: envelope.originalSha256,
    countersignedAt: envelope.countersignedAt?.toISOString() ?? null,
    timeline: [...requests]
      .sort((a, b) => a.signingOrder - b.signingOrder)
      .map((r) => ({
        signerId: r.id,
        signerName: r.signerName,
        lines: buildEvidenceSummaryLines(
          parseEvidence(r.evidence),
          { name: r.signerName, cpf: r.signerCpf, role: r.role },
          tz
        ),
      })),
  }
}

// ---- Public signer view (minimized, never leaks ids/evidence) ----

export interface PublicSigningView {
  clinicName: string
  documentTitle: string
  signerName: string
  role: string
  status: string
  expiresAt: string
  hasCpfOnFile: boolean
  availableChannels: string[] // EMAIL / WHATSAPP
  maskedEmail: string | null
  maskedPhone: string | null
}

export function toPublicSigningView(
  request: Pick<
    RequestRow,
    "signerName" | "role" | "status" | "expiresAt" | "signerCpf" | "signerEmail" | "signerPhone"
  >,
  clinic: { name: string },
  documentTitle: string
): PublicSigningView {
  const channels: string[] = []
  if (request.signerEmail) channels.push("EMAIL")
  if (request.signerPhone) channels.push("WHATSAPP")
  return {
    clinicName: clinic.name,
    documentTitle,
    signerName: request.signerName,
    role: request.role,
    status: request.status,
    expiresAt: request.expiresAt.toISOString(),
    hasCpfOnFile: !!request.signerCpf,
    availableChannels: channels,
    maskedEmail: request.signerEmail ? maskContact(request.signerEmail) : null,
    maskedPhone: request.signerPhone ? maskContact(request.signerPhone) : null,
  }
}

// ---- Public verification result (masked) ----

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return ""
  const first = parts[0]
  if (parts.length === 1) return first
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? ""
  return `${first} ${lastInitial}.`
}

export interface VerificationResult {
  valido: boolean
  clinica?: string
  tituloDocumento?: string
  assinadoEm?: string | null
  signatarios?: { nome: string; cpf: string; role: string; assinadoEm: string | null }[]
  sha256Final?: string | null
  contraAssinaturaICP?: boolean
}

export function toVerificationResult(
  envelope: EnvelopeRow & { clinicName: string; documentTitle: string },
  requests: RequestRow[]
): VerificationResult {
  return {
    valido: true,
    clinica: envelope.clinicName,
    tituloDocumento: envelope.documentTitle,
    assinadoEm: envelope.completedAt?.toISOString() ?? null,
    signatarios: [...requests]
      .sort((a, b) => a.signingOrder - b.signingOrder)
      .map((r) => ({
        nome: maskName(r.signerName),
        cpf: r.signerCpf ? maskCpf(r.signerCpf) : "***.***.***-**",
        role: r.role,
        assinadoEm: r.signedAt?.toISOString() ?? null,
      })),
    sha256Final: envelope.signedSha256,
    contraAssinaturaICP: !!envelope.countersignedAt,
  }
}

export { maskName }
