import { NextResponse } from "next/server"
import { z } from "zod"
import { Role, RecurrenceType, RecurrenceEndType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  calculateTodoRecurrenceDates,
  validateTodoRecurrenceOptions,
  parseDay,
} from "@/lib/todos"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida (YYYY-MM-DD)")

const recurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES", "INDEFINITE"]),
  endDate: isoDate.optional(),
  occurrences: z.number().int().min(1).max(52).optional(),
})

const createSchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio").max(200),
  notes: z.string().max(2000).optional().nullable(),
  day: isoDate,
  professionalProfileId: z.string().min(1, "Responsavel e obrigatorio"),
  done: z.boolean().optional(),
  recurrence: recurrenceSchema.optional(),
})

/**
 * GET /api/todos — list todos with filters.
 * ADMIN sees all clinic todos; PROFESSIONAL sees only own.
 *
 * Query params: from, to (YYYY-MM-DD), status (open|done|overdue|all),
 * assignee, recurrence (none|weekly|biweekly|monthly|all), q (search).
 */
export const GET = withFeatureAuth(
  { feature: "todos", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const status = searchParams.get("status") ?? "all"
    const assignee = searchParams.get("assignee") ?? "all"
    const recurrence = searchParams.get("recurrence") ?? "all"
    const q = searchParams.get("q")?.trim() ?? ""

    const where: Record<string, unknown> = { clinicId: user.clinicId }

    // Scope to professional unless ADMIN
    if (user.role !== Role.ADMIN && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (assignee !== "all") {
      where.professionalProfileId = assignee
    }

    if (from || to) {
      const dayFilter: Record<string, Date> = {}
      if (from) dayFilter.gte = parseDay(from)
      if (to) dayFilter.lte = parseDay(to)
      where.day = dayFilter
    }

    if (status === "open") where.done = false
    else if (status === "done") where.done = true
    else if (status === "overdue") {
      where.done = false
      where.day = { ...(where.day as Record<string, Date> | undefined), lt: parseDay(todayIso()) }
    }

    if (recurrence === "none") where.recurrenceId = null
    else if (recurrence === "weekly" || recurrence === "biweekly" || recurrence === "monthly") {
      where.recurrence = { recurrenceType: recurrence.toUpperCase() as RecurrenceType }
    }

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ]
    }

    const todos = await prisma.todo.findMany({
      where,
      orderBy: [{ day: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      include: {
        recurrence: {
          select: {
            id: true,
            recurrenceType: true,
            recurrenceEndType: true,
            endDate: true,
            occurrences: true,
            isActive: true,
          },
        },
        professionalProfile: {
          select: { id: true, user: { select: { name: true } } },
        },
      },
    })

    return NextResponse.json({ todos })
  }
)

/**
 * POST /api/todos — create a single todo, or a recurring series.
 * If `recurrence` is provided, a TodoRecurrence is created and child Todo rows
 * are materialized for each occurrence.
 */
export const POST = withFeatureAuth(
  { feature: "todos", minAccess: "WRITE" },
  async (req, { user }) => {
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: "Corpo invalido" }, { status: 400 }) }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 })
    }
    const data = parsed.data

    // Professionals can only create todos assigned to themselves
    if (user.role !== Role.ADMIN && user.professionalProfileId !== data.professionalProfileId) {
      return NextResponse.json({ error: "So e possivel criar tarefas para si mesmo" }, { status: 403 })
    }

    // Verify the assignee belongs to this clinic
    const prof = await prisma.professionalProfile.findFirst({
      where: { id: data.professionalProfileId, user: { clinicId: user.clinicId } },
      select: { id: true },
    })
    if (!prof) return NextResponse.json({ error: "Responsavel invalido" }, { status: 400 })

    if (!data.recurrence) {
      const todo = await prisma.todo.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: data.professionalProfileId,
          title: data.title,
          notes: data.notes ?? null,
          day: parseDay(data.day),
          done: data.done ?? false,
          doneAt: data.done ? new Date() : null,
        },
      })
      return NextResponse.json({ todo }, { status: 201 })
    }

    // Recurring todo
    const validation = validateTodoRecurrenceOptions({
      recurrenceType: data.recurrence.recurrenceType as RecurrenceType,
      recurrenceEndType: data.recurrence.recurrenceEndType as RecurrenceEndType,
      endDate: data.recurrence.endDate,
      occurrences: data.recurrence.occurrences,
    })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const dates = calculateTodoRecurrenceDates(data.day, {
      recurrenceType: data.recurrence.recurrenceType as RecurrenceType,
      recurrenceEndType: data.recurrence.recurrenceEndType as RecurrenceEndType,
      endDate: data.recurrence.endDate,
      occurrences: data.recurrence.occurrences,
    })

    const dayOfWeek = parseDay(data.day).getDay()

    const recurrence = await prisma.$transaction(async (tx) => {
      const rec = await tx.todoRecurrence.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: data.professionalProfileId,
          title: data.title,
          notes: data.notes ?? null,
          dayOfWeek,
          recurrenceType: data.recurrence!.recurrenceType as RecurrenceType,
          recurrenceEndType: data.recurrence!.recurrenceEndType as RecurrenceEndType,
          startDate: parseDay(data.day),
          endDate: data.recurrence!.endDate ? parseDay(data.recurrence!.endDate) : null,
          occurrences: data.recurrence!.occurrences ?? null,
          lastGeneratedDate: parseDay(dates[dates.length - 1]),
        },
      })
      await tx.todo.createMany({
        data: dates.map((iso) => ({
          clinicId: user.clinicId,
          professionalProfileId: data.professionalProfileId,
          recurrenceId: rec.id,
          title: data.title,
          notes: data.notes ?? null,
          day: parseDay(iso),
          done: false,
        })),
      })
      return rec
    })

    return NextResponse.json({ recurrence, count: dates.length }, { status: 201 })
  }
)

function todayIso(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
