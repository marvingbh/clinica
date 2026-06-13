import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import {
  hashFormToken,
  parseFieldsSafe,
  effectiveStatus,
  computeProgress,
  sanitizeAnswers,
  validateSubmission,
  validateAnswer,
  resolveTodoAssignee,
  type FormAnswers,
  type FormField,
} from "@/lib/forms"

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
      formVersion: { select: { fields: true, template: { select: { name: true } } } },
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
  for (const [id, value] of Object.entries(parsed.data.answers)) {
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
  await runCompletionSideEffects(response, fields).catch((err) =>
    console.error("Form completion side effects failed:", err)
  )

  return NextResponse.json({ message: "Respostas enviadas com sucesso" })
}

async function runCompletionSideEffects(response: LoadedResponse, fields: FormField[]): Promise<void> {
  const clinicId = response.clinic.id
  const formName = response.formVersion.template.name
  const patientName = response.patient.name

  // 1) Todo for the resolved professional.
  const assignee = resolveTodoAssignee({
    patientReferenceProfessionalId: response.patient.referenceProfessionalId,
    responseProfessionalProfileId: response.professionalProfileId,
  })
  if (assignee) {
    const today = new Date()
    const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    await prisma.todo.create({
      data: {
        clinicId,
        professionalProfileId: assignee,
        title: `Formulário respondido — ${patientName}`,
        day,
      },
    })
  }

  // 2) FORM_COMPLETED email to the responsible professional, else admins.
  const recipients = await resolveCompletionRecipients(clinicId, assignee)
  if (recipients.length > 0) {
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } })
    const vars = { patientName, formName, clinicName: clinic?.name ?? "" }
    const tmpl = await getTemplate(clinicId, NotificationType.FORM_COMPLETED, NotificationChannel.EMAIL)
    const content = renderTemplate(tmpl.content, vars)
    const subject = tmpl.subject ? renderTemplate(tmpl.subject, vars) : undefined
    for (const email of recipients) {
      await createAndSendNotification({
        clinicId,
        type: NotificationType.FORM_COMPLETED,
        channel: NotificationChannel.EMAIL,
        recipient: email,
        subject,
        content,
      })
    }
  }

  // 3) Public audit (no staff actor).
  await logSystemAudit({
    clinicId,
    action: AuditAction.FORM_RESPONSE_COMPLETED,
    entityType: "FormResponse",
    entityId: response.id,
    newValues: { fieldCount: fields.filter((f) => f.type !== "section").length },
  })
}

async function resolveCompletionRecipients(clinicId: string, assignee: string | null): Promise<string[]> {
  if (assignee) {
    const prof = await prisma.professionalProfile.findFirst({
      where: { id: assignee, user: { clinicId } },
      select: { user: { select: { email: true, isActive: true } } },
    })
    if (prof?.user.isActive && prof.user.email) return [prof.user.email]
  }
  const admins = await prisma.user.findMany({
    where: { clinicId, role: "ADMIN", isActive: true },
    select: { email: true },
  })
  return admins.map((a) => a.email).filter((e): e is string => !!e)
}
