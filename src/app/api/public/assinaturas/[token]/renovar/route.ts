import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import { resolveSigningToken } from "../../_lib/resolve"
import { createSignatureTodo } from "@/lib/assinaturas/service"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * The signer asks for a fresh link after the current one expired. We don't mint
 * a token here (only staff resend) — we create at most one pending Todo for the
 * staff and acknowledge.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`assinatura-renew:${ip}`, RATE_LIMIT_CONFIGS.sensitive)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429, headers: NO_STORE })
  }

  const { token } = await params
  const outcome = await resolveSigningToken(token)
  if (outcome.kind !== "expired") {
    // Only meaningful for an expired link; anything else ⇒ generic ok.
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  const env = await prisma.signatureEnvelope.findUnique({
    where: { id: outcome.envelopeId },
    select: { requestedByUserId: true, document: { select: { title: true } }, patient: { select: { name: true, referenceProfessionalId: true } } },
  })
  if (!env) return NextResponse.json({ ok: true }, { headers: NO_STORE })

  const title = `Reenviar documento p/ assinatura: ${env.document.title} — ${env.patient?.name ?? ""}`

  // At most one pending (not done) renewal Todo per envelope.
  const existing = await prisma.todo.findFirst({
    where: { clinicId: outcome.clinicId, title, done: false },
    select: { id: true },
  })
  if (!existing) {
    await createSignatureTodo({
      clinicId: outcome.clinicId,
      requestedByUserId: env.requestedByUserId,
      patientReferenceProfessionalId: env.patient?.referenceProfessionalId ?? null,
      title,
      day: new Date(),
    }).catch(() => {})
  }

  await logSystemAudit({
    clinicId: outcome.clinicId,
    action: AuditAction.SIGNATURE_RENEWAL_REQUESTED,
    entityType: "SignatureRequest",
    entityId: outcome.requestId,
    request: req,
  }).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
