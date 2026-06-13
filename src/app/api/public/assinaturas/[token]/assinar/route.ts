import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { NotificationChannel } from "@prisma/client"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import {
  isValidCpf,
  cpfsMatch,
  normalizeCpf,
  verifyOtpCode,
  isOtpUsable,
  parseEvidence,
  appendOtpEvent,
  finalizeEvidence,
  generateSigningToken,
  hashSigningToken,
} from "@/lib/assinaturas"
import { resolveSigningToken } from "../../_lib/resolve"
import { finalizeEnvelope } from "@/lib/assinaturas/finalize"
import { sendSigningLink } from "@/lib/assinaturas/service"
import type { Prisma } from "@prisma/client"

const NO_STORE = { "Cache-Control": "private, no-store" }
const bodySchema = z.object({
  name: z.string().min(2),
  cpf: z.string().min(11),
  code: z.string().regex(/^\d{6}$/, "Código inválido"),
})

function authSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error("AUTH_SECRET required")
  return s
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req.headers)
  const ua = req.headers.get("user-agent") ?? undefined
  const rate = await checkRateLimit(`assinatura-sign:${ip}`, RATE_LIMIT_CONFIGS.sensitive)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429, headers: NO_STORE })
  }

  const { token } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, headers: NO_STORE })

  const outcome = await resolveSigningToken(token)
  if (outcome.kind === "cancelled") return NextResponse.json({ error: "Este envio foi cancelado pela clínica." }, { status: 410, headers: NO_STORE })
  if (outcome.kind === "completed_self") return NextResponse.json({ error: "Documento já assinado." }, { status: 409, headers: NO_STORE })
  if (outcome.kind !== "ok") return NextResponse.json({ error: "Link inválido ou indisponível." }, { status: 404, headers: NO_STORE })

  const { ctx } = outcome
  if (!isValidCpf(parsed.data.cpf) || !cpfsMatch(ctx.request.signerCpf, parsed.data.cpf)) {
    return NextResponse.json({ error: "CPF não confere com o cadastro. Confira com a clínica." }, { status: 400, headers: NO_STORE })
  }

  const now = new Date()

  // Transaction: lock request by id, recheck status, verify OTP, consume, sign.
  const signResult = await prisma.$transaction(async (tx) => {
    const fresh = await tx.signatureRequest.findUnique({
      where: { id: ctx.requestId },
      select: { status: true, evidence: true, signerCpf: true },
    })
    if (!fresh) return { ok: false as const, status: 404, error: "Link inválido." }
    if (fresh.status === "ASSINADO") return { ok: false as const, status: 409, error: "Documento já assinado." }
    if (fresh.status !== "PENDENTE" && fresh.status !== "VISUALIZADO") {
      return { ok: false as const, status: 410, error: "Este envio não está mais ativo." }
    }

    const otp = await tx.signatureOtp.findFirst({
      where: { requestId: ctx.requestId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    })
    if (!otp) return { ok: false as const, status: 400, error: "Código inválido ou expirado. Tente novamente." }

    const usable = isOtpUsable(otp, now)
    if (!usable.usable) {
      return { ok: false as const, status: 400, error: "Código inválido ou expirado. Tente novamente." }
    }

    const valid = verifyOtpCode({ secret: authSecret(), requestId: ctx.requestId, code: parsed.data.code, codeHash: otp.codeHash })
    if (!valid) {
      await tx.signatureOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
      const evFail = appendOtpEvent(parseEvidence(fresh.evidence), now, otp.channel, "failed")
      await tx.signatureRequest.update({ where: { id: ctx.requestId }, data: { evidence: evFail as unknown as Prisma.InputJsonValue } })
      return { ok: false as const, status: 400, error: "Código inválido ou expirado. Tente novamente." }
    }

    // Consume + sign.
    await tx.signatureOtp.update({ where: { id: otp.id }, data: { consumedAt: now, attempts: { increment: 1 } } })
    let ev = appendOtpEvent(parseEvidence(fresh.evidence), now, otp.channel, "verified")
    ev = finalizeEvidence(ev, { signedAt: now, ip, userAgent: ua, countersigned: false })
    await tx.signatureRequest.update({
      where: { id: ctx.requestId },
      data: {
        status: "ASSINADO",
        signedAt: now,
        // store the typed CPF if none was on file
        ...(fresh.signerCpf ? {} : { signerCpf: normalizeCpf(parsed.data.cpf) }),
        evidence: ev as unknown as Prisma.InputJsonValue,
      },
    })
    return { ok: true as const, channel: otp.channel as NotificationChannel }
  })

  if (!signResult.ok) {
    return NextResponse.json({ error: signResult.error }, { status: signResult.status, headers: NO_STORE })
  }

  // Determine the next signer (sequential) or finalize.
  const remaining = await prisma.signatureRequest.findMany({
    where: { envelopeId: ctx.envelopeId },
    orderBy: { signingOrder: "asc" },
    select: { id: true, signingOrder: true, status: true, signerName: true, signerEmail: true, signerPhone: true, otpChannel: true, expiresAt: true },
  })
  const next = remaining.find((r) => r.status === "PENDENTE")

  if (next) {
    const nextToken = generateSigningToken()
    const sentChannel = await sendSigningLink({
      clinicId: ctx.clinicId,
      clinicName: ctx.clinicName,
      patientId: ctx.patientId,
      signer: { signerName: next.signerName, signerEmail: next.signerEmail, signerPhone: next.signerPhone, otpChannel: next.otpChannel },
      token: nextToken,
      documentTitle: ctx.documentTitle,
      expiresAt: next.expiresAt,
      tz: ctx.timezone,
    })
    await prisma.signatureRequest.update({
      where: { id: next.id },
      data: { tokenHash: hashSigningToken(nextToken), linkSentAt: new Date(), ...(sentChannel ? { otpChannel: sentChannel } : {}) },
    })
    return NextResponse.json({ signed: true }, { headers: NO_STORE })
  }

  // Last signer ⇒ finalize the envelope.
  const result = await finalizeEnvelope(ctx.envelopeId)
  return NextResponse.json(
    {
      signed: true,
      verificationCode: result?.verificationCode ?? null,
      downloadUrl: `/api/public/assinaturas/${token}/arquivo`,
    },
    { headers: NO_STORE }
  )
}
