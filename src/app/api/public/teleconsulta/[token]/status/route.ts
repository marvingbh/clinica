import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import {
  parseVideoToken,
  verifyVideoToken,
  resolveJoinState,
  getTelehealthConfig,
} from "@/lib/telehealth"

const INVALID_MSG = "Link de teleconsulta inválido. Confira o link recebido ou entre em contato com a clínica."

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

/**
 * GET /api/public/teleconsulta/[token]/status
 * Lightweight polling endpoint for the waiting screen. NOT audited (RN-11).
 * Returns only { state, professionalJoined }.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const ip = clientIp(req)
  const rl = await checkRateLimit(`teleconsulta-status:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } }
    )
  }

  const { token } = await ctx.params
  const parsed = parseVideoToken(token)
  if (!parsed || !verifyVideoToken(parsed.appointmentId, parsed.sig, process.env.AUTH_SECRET ?? "")) {
    return NextResponse.json({ error: INVALID_MSG }, { status: 400 })
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.appointmentId },
    select: {
      type: true,
      modality: true,
      status: true,
      scheduledAt: true,
      endAt: true,
      telehealthStartedAt: true,
      clinic: { select: { telehealthEnabled: true } },
    },
  })

  if (!appointment) {
    return NextResponse.json({ error: INVALID_MSG }, { status: 400 })
  }

  const state = resolveJoinState(
    appointment,
    { telehealthEnabled: appointment.clinic.telehealthEnabled },
    getTelehealthConfig(),
    new Date()
  )

  return NextResponse.json(
    { state: state.kind, professionalJoined: appointment.telehealthStartedAt != null },
    { headers: { "Cache-Control": "no-store" } }
  )
}
