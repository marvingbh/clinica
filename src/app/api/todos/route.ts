import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma, Role, RecurrenceType, RecurrenceEndType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  calculateTodoRecurrenceDates,
  validateTodoRecurrenceOptions,
  parseDay,
  todayIso,
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
    const fromRaw = searchParams.get("from")
    const toRaw = searchParams.get("to")
    const status = searchParams.get("status") ?? "all"
    const assignee = searchParams.get("assignee") ?? "all"
    const recurrence = searchParams.get("recurrence") ?? "all"
    const q = (searchParams.get("q") ?? "").trim().slice(0, 200)

    const isoRe = /^\d{4}-\d{2}-\d{2}$/
    if ((fromRaw && !isoRe.test(fromRaw)) || (toRaw && !isoRe.test(toRaw))) {
      return NextResponse.json({ error: "Data invalida (YYYY-MM-DD)" }, { status: 400 })
    }

    const where: Prisma.TodoWhereInput = { clinicId: user.clinicId }

    // Scope to professional unless ADMIN
    if (user.role !== Role.ADMIN && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (assignee !== "all") {
      where.professionalProfileId = assignee
    }

    // Build the day filter once so the overdue branch can extend it without
    // accidentally clobbering `from`/`to` bounds.
    const dayFilter: Prisma.DateTimeFilter = {}
    if (fromRaw) dayFilter.gte = parseDay(fromRaw)
    if (toRaw) dayFilter.lte = parseDay(toRaw)

    if (status === "open") where.done = false
    else if (status === "done") where.done = true
    else if (status === "overdue") {
      where.done = false
      dayFilter.lt = parseDay(todayIso())
    }

    if (Object.keys(dayFilter).length > 0) where.day = dayFilter

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

    // Recurring todo — control flow has already proven `data.recurrence` is non-null.
    const recOpts = data.recurrence
    const validation = validateTodoRecurrenceOptions({
      recurrenceType: recOpts.recurrenceType,
      recurrenceEndType: recOpts.recurrenceEndType,
      endDate: recOpts.endDate,
      occurrences: recOpts.occurrences,
    })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const dates = calculateTodoRecurrenceDates(data.day, {
      recurrenceType: recOpts.recurrenceType,
      recurrenceEndType: recOpts.recurrenceEndType,
      endDate: recOpts.endDate,
      occurrences: recOpts.occurrences,
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
          recurrenceType: recOpts.recurrenceType,
          recurrenceEndType: recOpts.recurrenceEndType,
          startDate: parseDay(data.day),
          endDate: recOpts.endDate ? parseDay(recOpts.endDate) : null,
          occurrences: recOpts.occurrences ?? null,
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
        skipDuplicates: true,
      })
      return rec
    })

    return NextResponse.json({ recurrence, count: dates.length }, { status: 201 })
  }
)
