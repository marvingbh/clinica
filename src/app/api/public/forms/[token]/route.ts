import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import {
  hashFormToken,
  parseFieldsSafe,
  effectiveStatus,
  computeProgress,
  sanitizeAnswers,
  validateSubmission,
  validateAnswer,
  runFormCompletionSideEffects,
  type FormAnswers,
} from "@/lib/forms"
import { archiveFormResponseAsDocument } from "@/lib/patient-documents/server"

const answersSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
})

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

async function rateLimited(req: NextRequest, token: string): Promise<NextResponse | null> {
  const result = await checkRateLimit(`forms-public:${clientIp(req)}:${token.slice(0, 12)}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!result.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 })
  }
  return null
}

/** Loads a response by token hash with everything the public flow needs. */
async function loadByToken(token: string) {
  if (!token || token.length < 20) return null
  return prisma.formResponse.findUnique({
    where: { tokenHash: hashFormToken(token) },
    include: {
      formVersion: { select: { version: true, fields: true, template: { select: { name: true } } } },
      patient: { select: { id: true, name: true, referenceProfessionalId: true } },
      clinic: { select: { id: true, name: true, logoData: true } },
    },
  })
}

type LoadedResponse = NonNullable<Awaited<ReturnType<typeof loadByToken>>>

/** 404/410/409 guard shared by GET/PATCH/POST. Returns null when fillable. */
function guardState(response: LoadedResponse): NextResponse | null {
  const status = effectiveStatus(response, new Date())
  if (status === "EXPIRADO") {
    return NextResponse.json({ expired: true, error: "Este link expirou. Peça um novo link à clínica." }, { status: 410 })
  }
  if (status === "CONCLUIDO") {
    return NextResponse.json({ completed: true, error: "Formulário já enviado" }, { status: 409 })
  }
  return null
}

/** GET — public display data + saved answers + progress. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = await rateLimited(req, token)
  if (limited) return limited

  const response = await loadByToken(token)
  if (!response) return NextResponse.json({ error: "Link inválido" }, { status: 404 })

  const guard = guardState(response)
  if (guard) return guard

  const fields = parseFieldsSafe(response.formVersion.fields)
  const answers = (response.answers ?? {}) as FormAnswers

  return NextResponse.json({
    clinicName: response.clinic.name,
    hasLogo: !!response.clinic.logoData,
    patientFirstName: response.patient.name.split(" ")[0],
    formName: response.formVersion.template.name,
    fields,
    answers,
    progress: computeProgress(fields, answers),
  })
}

/** PATCH — partial autosave. Merges sanitized answers, sets EM_PREENCHIMENTO. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = await rateLimited(req, token)
  if (limited) return limited

  const response = await loadByToken(token)
  if (!response) return NextResponse.json({ error: "Link inválido" }, { status: 404 })

  const guard = guardState(response)
  if (guard) return guard

  const parsed = answersSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

  const fields = parseFieldsSafe(response.formVersion.fields)
  const current = (response.answers ?? {}) as FormAnswers
  const merged = sanitizeAnswers(fields, { ...current, ...(parsed.data.answers as FormAnswers) })

  // Reject only if an explicitly-sent field is itself invalid (e.g. bad date).
  for (const id of Object.keys(parsed.data.answers)) {
    const field = fields.find((f) => f.id === id)
    if (!field || field.type === "section") continue
    if (merged[id] !== undefined) {
      const error = validateAnswer(field, merged[id])
      if (error) return NextResponse.json({ error, fieldId: id }, { status: 400 })
    }
  }

  const now = new Date()
  await prisma.formResponse.update({
    where: { id: response.id },
    data: {
      answers: merged as object,
      status: response.status === "ENVIADO" ? "EM_PREENCHIMENTO" : response.status,
      startedAt: response.startedAt ?? now,
    },
  })

  return NextResponse.json({ progress: computeProgress(fields, merged) })
}

/** POST — final submit. Validates, completes, fires Todo + notification + audit. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = await rateLimited(req, token)
  if (limited) return limited

  const response = await loadByToken(token)
  if (!response) return NextResponse.json({ error: "Link inválido" }, { status: 404 })

  const guard = guardState(response)
  if (guard) return guard

  const parsed = answersSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

  const fields = parseFieldsSafe(response.formVersion.fields)
  const current = (response.answers ?? {}) as FormAnswers
  const sanitized = sanitizeAnswers(fields, { ...current, ...(parsed.data.answers as FormAnswers) })

  const validation = validateSubmission(fields, sanitized)
  if (!validation.valid) {
    return NextResponse.json({ error: "Há campos pendentes", errors: validation.errors }, { status: 400 })
  }

  const now = new Date()
  await prisma.formResponse.update({
    where: { id: response.id },
    data: { answers: sanitized as object, status: "CONCLUIDO", completedAt: now },
  })

  // Side effects must not fail the patient's submit.
  await runFormCompletionSideEffects(response, fields).catch((err) =>
    console.error("Form completion side effects failed:", err)
  )

  // Archive the completed response as a PDF in the patient's document library
  // (source FORMULARIO). Best-effort: never blocks the submit. Kept here (a
  // server-only route) so @react-pdf/renderer stays out of the forms barrel.
  await archiveFormResponseAsDocument({
    id: response.id,
    completedAt: now,
    answers: sanitized,
    professionalProfileId: response.professionalProfileId,
    patient: { id: response.patient.id, name: response.patient.name },
    clinic: { id: response.clinic.id, name: response.clinic.name },
    formVersion: response.formVersion,
  }).catch((err) => console.error("Form archive failed:", err))

  return NextResponse.json({ message: "Respostas enviadas com sucesso" })
}
