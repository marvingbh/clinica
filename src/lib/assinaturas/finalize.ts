import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/bank-reconciliation/encryption"
import { AuditAction, logSystemAudit } from "@/lib/rbac/audit"
import { sha256Hex } from "./hashing"
import { generateVerificationCode } from "./verification-code"
import { buildSignaturePageData, type SignerSummary } from "./signature-page"
import { appendSignaturePage } from "./evidence-pdf"
import { countersignHash } from "./countersign"
import { mapDocumentTypeToConsents, buildConsentUpdateData } from "./consent-sync"
import { parseEvidence } from "./evidence"
import { maskName } from "./serialize"
import { notifyRequesterSigned, createSignatureTodo } from "./service"

interface FinalizeResult {
  verificationCode: string
  countersigned: boolean
}

/**
 * Finalizes an envelope once its last signer has signed. Pure-ish orchestration
 * that lives outside the request transaction (PDF generation + external-ish
 * crypto). All DB writes are tenant-scoped by clinicId.
 */
export async function finalizeEnvelope(envelopeId: string): Promise<FinalizeResult | null> {
  const envelope = await prisma.signatureEnvelope.findUnique({
    where: { id: envelopeId },
    select: {
      id: true, clinicId: true, status: true, originalSha256: true,
      requestedByUserId: true,
      document: { select: { pdfData: true, title: true, templateType: true } },
      patient: { select: { id: true, name: true, referenceProfessionalId: true } },
      clinic: { select: { name: true, timezone: true } },
      requests: {
        orderBy: { signingOrder: "asc" },
        select: {
          signerName: true, signerCpf: true, role: true, signedAt: true,
          otpChannel: true, evidence: true,
        },
      },
    },
  })
  if (!envelope || envelope.status !== "EM_ANDAMENTO") return null
  if (!envelope.document.pdfData) return null

  // Build the signature page.
  const verificationCode = generateVerificationCode()
  const signers: SignerSummary[] = envelope.requests.map((r) => {
    const ev = parseEvidence(r.evidence)
    return {
      name: r.signerName,
      cpf: r.signerCpf,
      role: r.role,
      signedAtIso: r.signedAt ? r.signedAt.toISOString() : null,
      ip: ev.signerIp,
      channel: r.otpChannel ?? undefined,
    }
  })

  // Countersign first (we need the flag for the page), then bake the page.
  // The detached countersignature is of the FINAL file hash, so it must be
  // computed after the page is appended. We therefore append the page with a
  // provisional countersigned flag, then compute the final hash & countersign.
  const nfseConfig = await prisma.nfseConfig.findFirst({
    where: { clinicId: envelope.clinicId, isActive: true },
    select: { privateKeyPem: true },
  })
  const willCountersign = !!nfseConfig

  const pageData = buildSignaturePageData({
    clinicName: envelope.clinic.name,
    documentTitle: envelope.document.title,
    verificationCode,
    originalSha256: envelope.originalSha256,
    signers,
    tz: envelope.clinic.timezone,
    countersigned: willCountersign,
  })

  const finalPdf = await appendSignaturePage(new Uint8Array(envelope.document.pdfData), pageData)
  const signedSha256 = sha256Hex(finalPdf)

  let countersignature: string | null = null
  let countersigned = false
  if (nfseConfig) {
    try {
      const keyPem = decrypt(nfseConfig.privateKeyPem)
      countersignature = countersignHash(signedSha256, keyPem)
      countersigned = true
    } catch {
      countersignature = null
      countersigned = false
    }
  }

  const now = new Date()
  await prisma.signatureEnvelope.update({
    where: { id: envelope.id },
    data: {
      status: "CONCLUIDO",
      signedPdf: Buffer.from(finalPdf),
      signedSha256,
      verificationCode,
      countersignature,
      countersignedAt: countersigned ? now : null,
      completedAt: now,
    },
  })

  // Sync LGPD consents on the patient.
  const fields = mapDocumentTypeToConsents(envelope.document.templateType)
  if (fields.length > 0) {
    const before = await prisma.patient.findUnique({
      where: { id: envelope.patient.id },
      select: { consentPhotoVideo: true, consentSessionRecording: true, consentWhatsApp: true, consentEmail: true },
    })
    const data = buildConsentUpdateData(fields, now)
    await prisma.patient.update({ where: { id: envelope.patient.id }, data })
    await logSystemAudit({
      clinicId: envelope.clinicId,
      action: AuditAction.PATIENT_UPDATED,
      entityType: "Patient",
      entityId: envelope.patient.id,
      oldValues: (before ?? {}) as Record<string, unknown>,
      newValues: { source: "signature", envelopeId: envelope.id, fields },
    }).catch(() => {})
  }

  // Todo + notification for the requester.
  await createSignatureTodo({
    clinicId: envelope.clinicId,
    requestedByUserId: envelope.requestedByUserId,
    patientReferenceProfessionalId: envelope.patient.referenceProfessionalId,
    title: `Documento assinado: ${envelope.document.title} — ${envelope.patient.name}`,
    day: now,
  }).catch(() => {})

  let requesterEmail: string | null = null
  if (envelope.requestedByUserId) {
    const u = await prisma.user.findFirst({
      where: { id: envelope.requestedByUserId, clinicId: envelope.clinicId },
      select: { email: true },
    })
    requesterEmail = u?.email ?? null
  }
  await notifyRequesterSigned({
    clinicId: envelope.clinicId,
    clinicName: envelope.clinic.name,
    patientId: envelope.patient.id,
    patientName: envelope.patient.name,
    documentTitle: envelope.document.title,
    recipientEmail: requesterEmail,
  }).catch(() => {})

  // Audit (actor is the signer, not staff → userId null).
  const lastSigner = envelope.requests[envelope.requests.length - 1]
  await logSystemAudit({
    clinicId: envelope.clinicId,
    action: AuditAction.SIGNATURE_COMPLETED,
    entityType: "SignatureEnvelope",
    entityId: envelope.id,
    newValues: {
      signerName: lastSigner ? maskName(lastSigner.signerName) : undefined,
      originalSha256: envelope.originalSha256,
      signedSha256,
      countersigned,
    },
  }).catch(() => {})

  return { verificationCode, countersigned }
}
