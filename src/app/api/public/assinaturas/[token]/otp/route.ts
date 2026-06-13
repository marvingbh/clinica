import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { NotificationChannel } from "@prisma/client"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import {
  isValidCpf,
  cpfsMatch,
  generateOtpCode,
  hashOtpCode,
  OTP_TTL_MINUTES,
  maskContact,
  parseEvidence,
  appendOtpEvent,
} from "@/lib/assinaturas"
import { resolveSigningToken } from "../../_lib/resolve"
import { sendSigningOtp, resolveSignerChannel } from "@/lib/assinaturas/service"
import type { Prisma } from "@prisma/client"

const NO_STORE = { "Cache-Control": "private, no-store" }
const bodySchema = z.object({
  name: z.string().min(2),
  cpf: z.string().min(11),
  channel: z.enum(["EMAIL", "WHATSAPP"]).optional(),
})

function authSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error("AUTH_SECRET required")
  return s
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`assinatura-otp:${ip}`, RATE_LIMIT_CONFIGS.sensitive)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429, headers: NO_STORE })
  }

  const { token } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400, headers: NO_STORE })

  const outcome = await resolveSigningToken(token)
  if (outcome.kind === "cancelled") return NextResponse.json({ error: "Este envio foi cancelado pela clínica." }, { status: 410, headers: NO_STORE })
  if (outcome.kind !== "ok") return NextResponse.json({ error: "Link inválido ou indisponível." }, { status: 404, headers: NO_STORE })

  const { ctx } = outcome
  if (!isValidCpf(parsed.data.cpf)) {
    return NextResponse.json({ error: "CPF inválido." }, { status: 400, headers: NO_STORE })
  }
  if (!cpfsMatch(ctx.request.signerCpf, parsed.data.cpf)) {
    return NextResponse.json({ error: "CPF não confere com o cadastro. Confira com a clínica." }, { status: 400, headers: NO_STORE })
  }

  // Per-request throttle: max 3 OTP sends per 15 min.
  const sendRate = await checkRateLimit(`assinatura-otp-req:${ctx.requestId}`, { maxRequests: 3, windowMs: 15 * 60 * 1000 })
  if (!sendRate.allowed) {
    return NextResponse.json({ error: "Você pediu muitos códigos. Aguarde alguns minutos." }, { status: 429, headers: NO_STORE })
  }

  const resolved = resolveSignerChannel(
    { signerName: ctx.request.signerName, signerEmail: ctx.request.signerEmail, signerPhone: ctx.request.signerPhone },
    (parsed.data.channel ?? ctx.request.otpChannel) as NotificationChannel | null
  )
  if (!resolved) return NextResponse.json({ error: "Sem contato para envio do código." }, { status: 400, headers: NO_STORE })

  const code = generateOtpCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000)

  await prisma.$transaction([
    // Invalidate previous unconsumed OTPs for this request.
    prisma.signatureOtp.updateMany({
      where: { requestId: ctx.requestId, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.signatureOtp.create({
      data: {
        clinicId: ctx.clinicId,
        requestId: ctx.requestId,
        codeHash: hashOtpCode(authSecret(), ctx.requestId, code),
        channel: resolved.channel,
        expiresAt,
      },
    }),
  ])

  // Persist the chosen channel + an evidence event.
  const ev = appendOtpEvent(parseEvidence(ctx.request.evidence), now, resolved.channel, "sent")
  await prisma.signatureRequest.update({
    where: { id: ctx.requestId },
    data: { otpChannel: resolved.channel, evidence: ev as unknown as Prisma.InputJsonValue },
  })

  await sendSigningOtp({
    clinicId: ctx.clinicId,
    clinicName: ctx.clinicName,
    patientId: ctx.patientId,
    recipient: resolved.recipient,
    channel: resolved.channel,
    code,
    documentTitle: ctx.documentTitle,
  })

  return NextResponse.json({ ok: true, sentTo: maskContact(resolved.recipient) }, { headers: NO_STORE })
}
