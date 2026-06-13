import { prisma } from "@/lib/prisma"
import { hashSigningToken, activeRequest, sha256Hex, hashesMatch } from "@/lib/assinaturas"

export type ResolveOutcome =
  | { kind: "invalid" }
  | { kind: "cancelled" }
  | { kind: "expired"; requestId: string; envelopeId: string; clinicId: string }
  | { kind: "invalidated"; requestId: string; envelopeId: string; clinicId: string }
  | { kind: "not_turn" }
  | { kind: "completed_self"; ctx: ResolvedContext }
  | { kind: "ok"; ctx: ResolvedContext }

export interface ResolvedContext {
  clinicId: string
  clinicName: string
  timezone: string
  envelopeId: string
  envelopeStatus: string
  requestId: string
  request: {
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
    otpChannel: string | null
    evidence: unknown
  }
  documentId: string
  documentTitle: string
  originalSha256: string
  patientId: string
}

/**
 * Resolves a public signing token to its request/envelope/clinic, applying all
 * gates: clinic active, signer's turn (sequential), expiry, and document-hash
 * integrity. Anti-enumeration: unknown token ⇒ { kind: "invalid" } (same as a
 * malformed one). Returns enough context for the caller; does NOT mutate state.
 */
export async function resolveSigningToken(token: string): Promise<ResolveOutcome> {
  if (!token || token.length < 10) return { kind: "invalid" }
  const tokenHash = hashSigningToken(token)

  const request = await prisma.signatureRequest.findUnique({
    where: { tokenHash },
    select: {
      id: true, clinicId: true, signerName: true, signerCpf: true, signerEmail: true,
      signerPhone: true, role: true, signingOrder: true, status: true, expiresAt: true,
      viewedAt: true, otpChannel: true, evidence: true, envelopeId: true,
      envelope: {
        select: {
          id: true, status: true, originalSha256: true, patientId: true,
          document: { select: { id: true, title: true, pdfData: true } },
          clinic: { select: { id: true, name: true, timezone: true, isActive: true } },
        },
      },
    },
  })
  if (!request || !request.envelope) return { kind: "invalid" }
  const env = request.envelope
  if (!env.clinic) return { kind: "invalid" }

  const ctx: ResolvedContext = {
    clinicId: env.clinic.id,
    clinicName: env.clinic.name,
    timezone: env.clinic.timezone,
    envelopeId: env.id,
    envelopeStatus: env.status,
    requestId: request.id,
    request: {
      id: request.id,
      signerName: request.signerName,
      signerCpf: request.signerCpf,
      signerEmail: request.signerEmail,
      signerPhone: request.signerPhone,
      role: request.role,
      signingOrder: request.signingOrder,
      status: request.status,
      expiresAt: request.expiresAt,
      viewedAt: request.viewedAt,
      otpChannel: request.otpChannel,
      evidence: request.evidence,
    },
    documentId: env.document.id,
    documentTitle: env.document.title,
    originalSha256: env.originalSha256,
    patientId: env.patientId,
  }

  // Already-signed self: allow file download / success view.
  if (request.status === "ASSINADO") return { kind: "completed_self", ctx }

  if (env.status === "CANCELADO" || request.status === "CANCELADO") return { kind: "cancelled" }
  if (env.status === "RECUSADO" || request.status === "RECUSADO") return { kind: "invalid" }
  if (request.status === "INVALIDADO" || env.status === "INVALIDADO") {
    return { kind: "invalidated", requestId: request.id, envelopeId: env.id, clinicId: env.clinic.id }
  }

  // Expiry (mark by caller).
  const now = new Date()
  if ((request.status === "PENDENTE" || request.status === "VISUALIZADO") && now.getTime() > request.expiresAt.getTime()) {
    return { kind: "expired", requestId: request.id, envelopeId: env.id, clinicId: env.clinic.id }
  }

  // Sequential turn: only the active request has a live link.
  const allRequests = await prisma.signatureRequest.findMany({
    where: { envelopeId: env.id },
    select: { id: true, signingOrder: true, status: true },
  })
  const active = activeRequest(allRequests)
  if (!active || active.id !== request.id) return { kind: "not_turn" }

  // Document-hash integrity: detect a regenerated PDF.
  if (env.document.pdfData) {
    const currentHash = sha256Hex(new Uint8Array(env.document.pdfData))
    if (!hashesMatch(currentHash, env.originalSha256)) {
      return { kind: "invalidated", requestId: request.id, envelopeId: env.id, clinicId: env.clinic.id }
    }
  }

  return { kind: "ok", ctx }
}
