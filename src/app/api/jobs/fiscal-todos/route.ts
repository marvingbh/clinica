import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  fiscalTodoKind,
  planPfTodos,
  planDmedTodos,
  filterNewTodos,
  reciboTodoTitle,
  dmedTodoTitle,
  type DmedClinic,
  type PlannedTodo,
} from "@/lib/jobs/fiscal-todos"

/**
 * GET /api/jobs/fiscal-todos
 * Creates annual fiscal-reminder Todos: PF recibo reminders in January, DMED
 * conference reminders in February. Idempotent per (clinic, professional, title).
 *
 * Schedule: 0 8 5 1,2 * (Jan 5 and Feb 5, 08:00 UTC)
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const now = new Date()
  const kind = fiscalTodoKind(now)
  if (!kind) {
    return NextResponse.json({ success: true, created: 0, skipped: "off-season" })
  }

  try {
    const previousYear = now.getUTCFullYear() - 1
    const title = kind === "PF" ? reciboTodoTitle(previousYear) : dmedTodoTitle(previousYear)

    const planned: PlannedTodo[] = kind === "PF" ? await planPf(now) : await planDmed(now)

    // Idempotency: drop todos that already exist for the season's title.
    const existing = await prisma.todo.findMany({
      where: { title, clinicId: { in: [...new Set(planned.map((p) => p.clinicId))] } },
      select: { clinicId: true, professionalProfileId: true, title: true },
    })
    const toCreate = filterNewTodos(planned, existing)

    if (toCreate.length > 0) {
      await prisma.todo.createMany({
        data: toCreate.map((t) => ({
          clinicId: t.clinicId,
          professionalProfileId: t.professionalProfileId,
          title: t.title,
          notes: t.notes,
          day: new Date(`${t.day}T00:00:00.000Z`),
        })),
      })

      // Audit once per affected clinic (userId null — system job).
      const affectedClinics = [...new Set(toCreate.map((t) => t.clinicId))]
      for (const clinicId of affectedClinics) {
        const count = toCreate.filter((t) => t.clinicId === clinicId).length
        await prisma.auditLog
          .create({
            data: {
              clinicId,
              userId: null,
              action: "FISCAL_TODOS_CREATED",
              entityType: "Todo",
              entityId: "batch",
              newValues: { kind, count, title },
            },
          })
          .catch(() => {})
      }
    }

    return NextResponse.json({
      success: true,
      kind,
      created: toCreate.length,
      executionTimeMs: Date.now() - startTime,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

async function planPf(now: Date): Promise<PlannedTodo[]> {
  const profs = await prisma.professionalProfile.findMany({
    where: { fiscalRegime: "PF", user: { isActive: true } },
    select: { id: true, user: { select: { clinicId: true } } },
  })
  return planPfTodos(
    profs.map((p) => ({ professionalProfileId: p.id, clinicId: p.user.clinicId })),
    now
  )
}

async function planDmed(now: Date): Promise<PlannedTodo[]> {
  const configs = await prisma.fiscalConfig.findMany({
    where: { dmedEnabled: true },
    select: { clinicId: true },
  })

  const clinics: DmedClinic[] = []
  for (const cfg of configs) {
    // Prefer an active ADMIN with a professional profile; fall back to the first
    // active professional of the clinic.
    const adminProfile = await prisma.professionalProfile.findFirst({
      where: { user: { clinicId: cfg.clinicId, role: "ADMIN", isActive: true } },
      select: { id: true },
    })
    const fallback = adminProfile
      ? null
      : await prisma.professionalProfile.findFirst({
          where: { user: { clinicId: cfg.clinicId, isActive: true } },
          select: { id: true },
        })
    clinics.push({
      clinicId: cfg.clinicId,
      assigneeProfileId: adminProfile?.id ?? fallback?.id ?? null,
    })
  }

  return planDmedTodos(clinics, now)
}

export { GET as POST }
