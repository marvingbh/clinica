import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import {
  toPublicSigningView,
  parseEvidence,
  appendViewEvent,
  envelopeStatusFrom,
} from "@/lib/assinaturas"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import { resolveSigningToken } from "../_lib/resolve"
import { createSignatureTodo } from "@/lib/assinaturas/service"
import type { Prisma } from "@prisma/client"

const NO_STORE = { "Cache-Control": "private, no-store" }

/** Marks a request EXPIRADO and recomputes the envelope status. */
async function markExpired(requestId: string, envelopeId: string, clinicId: string) {
  await prisma.signatureRequest.update({ where: { id: requestId }, data: { status: "EXPIRADO" } })
  const reqs = await prisma.signatureRequest.findMany({ where: { envelopeId }, select: { status: true } })
  await prisma.signatureEnvelope.update({ where: { id: envelopeId }, data: { status: envelopeStatusFrom(reqs as never) } })
  await logSystemAudit({ clinicId, action: AuditAction.SIGNATURE_EXPIRED, entityType: "SignatureRequest", entityId: requestId }).catch(() => {})
}

/** Marks an envelope INVALIDADO (regenerated doc) + Todo for staff. */
async function markInvalidated(requestId: string, envelopeId: string, clinicId: string) {
  const env = await prisma.signatureEnvelope.findUnique({
    where: { id: envelopeId },
    select: { patientId: true, requestedByUserId: true, document: { select: { title: true } }, patient: { select: { name: true, referenceProfessionalId: true } } },
  })
  await prisma.$transaction([
    prisma.signatureRequest.updateMany({ where: { envelopeId, status: { in: ["PENDENTE", "VISUALIZADO"] } }, data: { status: "INVALIDADO" } }),
    prisma.signatureEnvelope.update({ where: { id: envelopeId }, data: { status: "INVALIDADO" } }),
  ])
  if (env) {
    await createSignatureTodo({
      clinicId,
      requestedByUserId: env.requestedByUserId,
      patientReferenceProfessionalId: env.patient?.referenceProfessionalId ?? null,
      title: `Reenviar documento (atualizado): ${env.document.title} — ${env.patient?.name ?? ""}`,
      day: new Date(),
    }).catch(() => {})
  }
  await logSystemAudit({ clinicId, action: AuditAction.SIGNATURE_INVALIDATED, entityType: "SignatureEnvelope", entityId: envelopeId }).catch(() => {})
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`assinatura-view:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429, headers: NO_STORE })
  }

  const { token } = await params
  const outcome = await resolveSigningToken(token)

  if (outcome.kind === "invalid" || outcome.kind === "not_turn") {
    return NextResponse.json({ state: "invalid" }, { status: 404, headers: NO_STORE })
  }
  if (outcome.kind === "cancelled") {
    return NextResponse.json({ state: "cancelled" }, { headers: NO_STORE })
  }
  if (outcome.kind === "expired") {
    await markExpired(outcome.requestId, outcome.envelopeId, outcome.clinicId)
    return NextResponse.json({ state: "expired" }, { headers: NO_STORE })
  }
  if (outcome.kind === "invalidated") {
    await markInvalidated(outcome.requestId, outcome.envelopeId, outcome.clinicId)
    return NextResponse.json({ state: "invalidated" }, { headers: NO_STORE })
  }
  if (outcome.kind === "completed_self") {
    return NextResponse.json({ state: "signed", view: toPublicSigningView(outcome.ctx.request, { name: outcome.ctx.clinicName }, outcome.ctx.documentTitle) }, { headers: NO_STORE })
  }

  // ok — mark VISUALIZADO on first view + append a view event.
  const { ctx } = outcome
  if (ctx.request.status === "PENDENTE") {
    const ev = appendViewEvent(parseEvidence(ctx.request.evidence), new Date(), ip, req.headers.get("user-agent") ?? undefined)
    await prisma.signatureRequest.update({
      where: { id: ctx.requestId },
      data: { status: "VISUALIZADO", viewedAt: new Date(), evidence: ev as unknown as Prisma.InputJsonValue },
    })
    await logSystemAudit({ clinicId: ctx.clinicId, action: AuditAction.SIGNATURE_VIEWED, entityType: "SignatureRequest", entityId: ctx.requestId, request: req }).catch(() => {})
  }

  return NextResponse.json(
    { state: "active", view: toPublicSigningView(ctx.request, { name: ctx.clinicName }, ctx.documentTitle) },
    { headers: NO_STORE }
  )
}
