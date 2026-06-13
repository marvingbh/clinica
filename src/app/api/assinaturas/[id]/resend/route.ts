import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import {
  generateSigningToken,
  hashSigningToken,
  computeExpiry,
  canResend,
  parseEvidence,
  markSent,
} from "@/lib/assinaturas"
import { sendSigningLink } from "@/lib/assinaturas/service"
import { canAccessPatientSignatures } from "../../_lib/scope"
import type { Prisma } from "@prisma/client"

const bodySchema = z.object({ requestId: z.string().min(1) })

export const POST = withFeatureAuth(
  { feature: "assinaturas", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }, params) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "requestId obrigatório" }, { status: 400 })

    const envelope = await prisma.signatureEnvelope.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: {
        id: true, patientId: true, status: true, originalSha256: true,
        document: { select: { title: true } },
        clinic: { select: { name: true, timezone: true } },
      },
    })
    if (!envelope) return NextResponse.json({ error: "Envelope não encontrado" }, { status: 404 })
    if (!(await canAccessPatientSignatures(user, envelope.patientId))) {
      return NextResponse.json({ error: "Envelope não encontrado" }, { status: 404 })
    }

    const request = await prisma.signatureRequest.findFirst({
      where: { id: parsed.data.requestId, envelopeId: envelope.id },
    })
    if (!request) return NextResponse.json({ error: "Signatário não encontrado" }, { status: 404 })
    if (!canResend({ status: request.status })) {
      return NextResponse.json({ error: "Este signatário não pode ser reenviado." }, { status: 422 })
    }

    const now = new Date()
    const token = generateSigningToken()
    const expiresAt = computeExpiry(now)

    const sentChannel = await sendSigningLink({
      clinicId: user.clinicId,
      clinicName: envelope.clinic.name,
      patientId: envelope.patientId,
      signer: {
        signerName: request.signerName,
        signerEmail: request.signerEmail,
        signerPhone: request.signerPhone,
        otpChannel: request.otpChannel,
      },
      token,
      documentTitle: envelope.document.title,
      expiresAt,
      tz: envelope.clinic.timezone,
    })

    const ev = sentChannel ? markSent(parseEvidence(request.evidence), now, sentChannel) : parseEvidence(request.evidence)

    await prisma.$transaction([
      prisma.signatureRequest.update({
        where: { id: request.id },
        data: {
          tokenHash: hashSigningToken(token),
          status: "PENDENTE",
          expiresAt,
          linkSentAt: now,
          remindersSent: 0,
          lastReminderAt: null,
          ...(sentChannel ? { otpChannel: sentChannel } : {}),
          evidence: ev as unknown as Prisma.InputJsonValue,
        },
      }),
      ...(envelope.status === "EXPIRADO"
        ? [prisma.signatureEnvelope.update({ where: { id: envelope.id }, data: { status: "EM_ANDAMENTO" } })]
        : []),
    ])

    await audit.log({
      user,
      action: AuditAction.SIGNATURE_REQUEST_RESENT,
      entityType: "SignatureRequest",
      entityId: request.id,
      newValues: { envelopeId: envelope.id },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  }
)
