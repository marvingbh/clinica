import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import {
  parseVideoToken,
  verifyVideoToken,
  resolveJoinState,
  resolveRoomKey,
  deriveRoomName,
  getTelehealthConfig,
  getVideoProvider,
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
 * GET /api/public/teleconsulta/[token]
 * Public (no auth) patient entry resolution. Tenant scoping is guaranteed by
 * the HMAC token: only a holder of the signed link reaches the record. Audited
 * (RN-11) and rate-limited (anti-enumeration). Returns the join state plus the
 * JoinInfo only when state === "OK".
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const ip = clientIp(req)
  const rl = await checkRateLimit(`teleconsulta:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } }
    )
  }

  const { token } = await ctx.params
  const parsed = parseVideoToken(token)
  if (!parsed) {
    return NextResponse.json({ error: INVALID_MSG }, { status: 400 })
  }

  const secret = process.env.AUTH_SECRET ?? ""
  if (!verifyVideoToken(parsed.appointmentId, parsed.sig, secret)) {
    return NextResponse.json({ error: INVALID_MSG }, { status: 400 })
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.appointmentId },
    select: {
      id: true,
      clinicId: true,
      type: true,
      modality: true,
      status: true,
      scheduledAt: true,
      endAt: true,
      groupId: true,
      sessionGroupId: true,
      meetingUrl: true,
      telehealthStartedAt: true,
      clinic: { select: { name: true, phone: true, telehealthEnabled: true } },
      patient: { select: { name: true } },
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })

  if (!appointment) {
    return NextResponse.json({ error: INVALID_MSG }, { status: 400 })
  }

  const config = getTelehealthConfig()
  const state = resolveJoinState(
    appointment,
    { telehealthEnabled: appointment.clinic.telehealthEnabled },
    config,
    new Date()
  )

  // Audit each entry-page access (RN-11). userId null = unauthenticated patient.
  await prisma.auditLog.create({
    data: {
      clinicId: appointment.clinicId,
      userId: null,
      action: "TELECONSULTA_ACESSO_PACIENTE",
      entityType: "Appointment",
      entityId: appointment.id,
      ipAddress: ip === "unknown" ? null : ip,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  }).catch(() => {})

  const firstName = appointment.patient?.name?.trim().split(/\s+/)[0]
  const body: Record<string, unknown> = {
    state: state.kind,
    scheduledAt: appointment.scheduledAt.toISOString(),
    patientFirstName: firstName ?? "Paciente",
    professionalName: appointment.professionalProfile.user.name,
    clinicName: appointment.clinic.name,
    clinicPhone: appointment.clinic.phone,
    professionalJoined: appointment.telehealthStartedAt != null,
  }

  if (state.kind === "OK") {
    const roomKey = resolveRoomKey(appointment)
    const roomName = deriveRoomName(roomKey, secret)
    const provider = getVideoProvider(config)
    body.join = provider.patientJoinInfo({ roomName }, firstName ?? "Paciente")
  }

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
