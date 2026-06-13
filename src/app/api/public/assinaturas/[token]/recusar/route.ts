import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import { resolveSigningToken } from "../../_lib/resolve"
import { createSignatureTodo } from "@/lib/assinaturas/service"

const NO_STORE = { "Cache-Control": "private, no-store" }
const bodySchema = z.object({ reason: z.string().max(1000).optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`assinatura-decline:${ip}`, RATE_LIMIT_CONFIGS.sensitive)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429, headers: NO_STORE })
  }

  const { token } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  const reason = parsed.success ? parsed.data.reason ?? null : null

  const outcome = await resolveSigningToken(token)
  if (outcome.kind === "cancelled") return NextResponse.json({ error: "Este envio foi cancelado pela clínica." }, { status: 410, headers: NO_STORE })
  if (outcome.kind !== "ok") return NextResponse.json({ error: "Link inválido ou indisponível." }, { status: 404, headers: NO_STORE })

  const { ctx } = outcome
  const now = new Date()

  const env = await prisma.signatureEnvelope.findUnique({
    where: { id: ctx.envelopeId },
    select: { requestedByUserId: true, document: { select: { title: true } }, patient: { select: { name: true, referenceProfessionalId: true } } },
  })

  await prisma.$transaction([
    prisma.signatureRequest.update({
      where: { id: ctx.requestId },
      data: { status: "RECUSADO", declinedAt: now, declineReason: reason },
    }),
    prisma.signatureEnvelope.update({ where: { id: ctx.envelopeId }, data: { status: "RECUSADO" } }),
  ])

  if (env) {
    await createSignatureTodo({
      clinicId: ctx.clinicId,
      requestedByUserId: env.requestedByUserId,
      patientReferenceProfessionalId: env.patient?.referenceProfessionalId ?? null,
      title: `Assinatura recusada: ${ctx.request.signerName} — ${env.document.title}`,
      day: now,
    }).catch(() => {})
  }

  await logSystemAudit({
    clinicId: ctx.clinicId,
    action: AuditAction.SIGNATURE_DECLINED,
    entityType: "SignatureRequest",
    entityId: ctx.requestId,
    newValues: { envelopeId: ctx.envelopeId, hasReason: !!reason },
    request: req,
  }).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
