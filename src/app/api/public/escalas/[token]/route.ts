import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import {
  hashScaleToken,
  getScaleDefinition,
  isScaleCode,
  validateAnswers,
  mergeAnswers,
  isComplete,
  getProgress,
  scoreScale,
  resolveRiskPatientMessage,
  ScaleValidationError,
  type AnswerMap,
} from "@/lib/scales"
import { runScaleRiskPipeline } from "@/lib/scales/risk-pipeline"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"

const answersSchema = z.object({ answers: z.record(z.string(), z.number()) })

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

async function rateLimited(req: NextRequest, token: string): Promise<NextResponse | null> {
  const result = await checkRateLimit(
    `escalas-public:${clientIp(req)}:${token.slice(0, 12)}`,
    RATE_LIMIT_CONFIGS.publicApi
  )
  if (!result.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 })
  }
  return null
}

/** Loads an administration by token hash with everything the public flow needs. */
async function loadByToken(token: string) {
  if (!token || token.length < 20) return null
  return prisma.scaleAdministration.findUnique({
    where: { tokenHash: hashScaleToken(token) },
    select: {
      id: true,
      scaleCode: true,
      status: true,
      answers: true,
      expiresAt: true,
      startedAt: true,
      patientId: true,
      professionalProfileId: true,
      clinic: { select: { id: true, name: true, scaleRiskMessage: true } },
      patient: { select: { name: true } },
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadByToken>>>

function isExpired(a: Loaded, now: Date): boolean {
  return a.status === "EXPIRADA" || (a.expiresAt !== null && a.expiresAt < now)
}

/** GET — display data + saved answers + progress, with completed/expired guards. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = await rateLimited(req, token)
  if (limited) return limited

  const a = await loadByToken(token)
  if (!a || !isScaleCode(a.scaleCode)) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 })
  }

  if (a.status === "CONCLUIDA") {
    return NextResponse.json({
      alreadyCompleted: true,
      message: "Este questionário já foi respondido. Obrigado!",
    })
  }
  if (isExpired(a, new Date())) {
    return NextResponse.json(
      { expired: true, error: "Este link expirou. Peça um novo link para a clínica." },
      { status: 410 }
    )
  }

  const def = getScaleDefinition(a.scaleCode)
  const answers = (a.answers ?? {}) as AnswerMap

  return NextResponse.json({
    scale: {
      shortName: def.shortName,
      stem: def.stem,
      items: def.items.map((i) => ({ id: i.id, text: i.text })),
      options: def.options,
    },
    savedAnswers: answers,
    progress: getProgress(def, answers),
    clinicName: a.clinic.name,
    professionalName: a.professionalProfile.user.name,
    patientFirstName: a.patient.name.split(" ")[0],
  })
}

/** PATCH — partial autosave; sets startedAt on first save; 410 if expired. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = await rateLimited(req, token)
  if (limited) return limited

  const a = await loadByToken(token)
  if (!a || !isScaleCode(a.scaleCode)) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 })
  }
  if (a.status === "CONCLUIDA") {
    return NextResponse.json({ error: "Questionário já respondido" }, { status: 409 })
  }
  if (isExpired(a, new Date())) {
    return NextResponse.json(
      { expired: true, error: "Este link expirou. Peça um novo link para a clínica." },
      { status: 410 }
    )
  }

  const parsed = answersSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

  const def = getScaleDefinition(a.scaleCode)
  let patch: AnswerMap
  try {
    patch = validateAnswers(def, parsed.data.answers)
  } catch (e) {
    if (e instanceof ScaleValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }

  const merged = mergeAnswers((a.answers ?? {}) as AnswerMap, patch)
  const now = new Date()
  await prisma.scaleAdministration.update({
    where: { id: a.id },
    data: { answers: merged, startedAt: a.startedAt ?? now },
  })

  return NextResponse.json({ progress: getProgress(def, merged) })
}

/** POST — final submit; idempotent if already CONCLUIDA; fires risk pipeline. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = await rateLimited(req, token)
  if (limited) return limited

  const a = await loadByToken(token)
  if (!a || !isScaleCode(a.scaleCode)) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 })
  }
  const def = getScaleDefinition(a.scaleCode)

  // Idempotent: a duplicate submit returns the same completion screen.
  if (a.status === "CONCLUIDA") {
    return NextResponse.json(buildCompletion(a, false))
  }
  if (isExpired(a, new Date())) {
    return NextResponse.json(
      { expired: true, error: "Este link expirou. Peça um novo link para a clínica." },
      { status: 410 }
    )
  }

  const parsed = answersSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

  let patch: AnswerMap
  try {
    patch = validateAnswers(def, parsed.data.answers)
  } catch (e) {
    if (e instanceof ScaleValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }

  const merged = mergeAnswers((a.answers ?? {}) as AnswerMap, patch)
  if (!isComplete(def, merged)) {
    return NextResponse.json({ error: "Responda todas as perguntas." }, { status: 400 })
  }

  const score = scoreScale(def, merged)
  const now = new Date()
  await prisma.scaleAdministration.update({
    where: { id: a.id },
    data: {
      answers: merged,
      status: "CONCLUIDA",
      totalScore: score.totalScore,
      severityLabel: score.severityLabel,
      riskFlag: score.riskFlag,
      completedAt: now,
    },
  })

  await logSystemAudit({
    clinicId: a.clinic.id,
    action: AuditAction.SCALE_COMPLETED,
    entityType: "ScaleAdministration",
    entityId: a.id,
    request: req,
  }).catch((err) => console.error("Scale completion audit failed:", err))

  if (score.riskFlag) {
    await runScaleRiskPipeline({
      clinicId: a.clinic.id,
      administrationId: a.id,
      patientId: a.patientId,
      professionalProfileId: a.professionalProfileId,
      scaleCode: def.code,
      patientName: a.patient.name,
      completedAt: now,
    }).catch((err) => console.error("Scale risk pipeline failed:", err))
  }

  return NextResponse.json(buildCompletion(a, score.riskFlag))
}

/** Patient-facing completion payload — never carries a score/severity. */
function buildCompletion(a: Loaded, riskEndorsed: boolean): {
  completed: true
  riskEndorsed: boolean
  message: string
} {
  const professionalName = a.professionalProfile.user.name
  const message = riskEndorsed
    ? resolveRiskPatientMessage(a.clinic.scaleRiskMessage)
    : `Obrigado! Suas respostas foram enviadas para ${professionalName}.`
  return { completed: true, riskEndorsed, message }
}
