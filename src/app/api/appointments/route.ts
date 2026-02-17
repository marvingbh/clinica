import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"
import { checkConflictsBulk, formatConflictError, createBulkAppointmentTokens, buildConfirmLink, buildCancelLink, validateRecurrenceOptions, calculateRecurrenceDates } from "@/lib/appointments"
import { createNotification, getPatientPhoneNumbers } from "@/lib/notifications"
import { NotificationChannel, NotificationType, RecurrenceType, RecurrenceEndType, AppointmentType } from "@prisma/client"
import { audit, AuditAction, type AuthUser } from "@/lib/rbac"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const recurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES", "INDEFINITE"]),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
  occurrences: z.number().int().min(1).max(52).optional(),
}).refine((data) => {
  if (data.recurrenceEndType === "BY_DATE" && !data.endDate) {
    return false
  }
  if (data.recurrenceEndType === "BY_OCCURRENCES" && !data.occurrences) {
    return false
  }
  // INDEFINITE does not require endDate or occurrences
  return true
}, {
  message: "End date is required for BY_DATE, occurrences is required for BY_OCCURRENCES",
})

// Calendar entry recurrence - only WEEKLY for non-patient types
const calendarEntryRecurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY"]),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES", "INDEFINITE"]),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
  occurrences: z.number().int().min(1).max(52).optional(),
}).refine((data) => {
  if (data.recurrenceEndType === "BY_DATE" && !data.endDate) {
    return false
  }
  if (data.recurrenceEndType === "BY_OCCURRENCES" && !data.occurrences) {
    return false
  }
  return true
}, {
  message: "End date is required for BY_DATE, occurrences is required for BY_OCCURRENCES",
})

const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  professionalProfileId: z.string().optional(),
  additionalProfessionalIds: z.array(z.string()).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
  recurrence: recurrenceSchema.optional(),
})

const createCalendarEntrySchema = z.object({
  type: z.enum(["TAREFA", "LEMBRETE", "NOTA", "REUNIAO"]),
  title: z.string().min(1, "Titulo e obrigatorio").max(200),
  professionalProfileId: z.string().optional(),
  additionalProfessionalIds: z.array(z.string()).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)"),
  duration: z.number().int().min(5).max(480).optional(),
  notes: z.string().max(2000).optional().nullable(),
  recurrence: calendarEntryRecurrenceSchema.optional(),
})

// Determine if entry type blocks time
function getBlocksTime(type: AppointmentType): boolean {
  return type === "TAREFA" || type === "REUNIAO" || type === "CONSULTA"
}

// Default durations for entry types
const DEFAULT_DURATIONS: Record<string, number> = {
  TAREFA: 60,
  LEMBRETE: 15,
  NOTA: 15,
  REUNIAO: 60,
}

/**
 * GET /api/appointments
 * List appointments - ADMIN sees all clinic appointments, PROFESSIONAL sees only their own
 */
export const GET = withAuth(
  { resource: "appointment", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const date = searchParams.get("date") // Single day filter (YYYY-MM-DD)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const professionalProfileId = searchParams.get("professionalProfileId")
    const type = searchParams.get("type") // Optional type filter

    // Base query always filters by clinic for multi-tenant isolation
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // If scope is "own", filter to only the professional's appointments (including as participant)
    if (scope === "own" && user.professionalProfileId) {
      where.OR = [
        { professionalProfileId: user.professionalProfileId },
        { additionalProfessionals: { some: { professionalProfileId: user.professionalProfileId } } },
      ]
    } else if (professionalProfileId && scope === "clinic") {
      // ADMIN can filter by specific professional (including as participant)
      where.OR = [
        { professionalProfileId },
        { additionalProfessionals: { some: { professionalProfileId } } },
      ]
    }

    // Apply optional filters
    if (status) {
      where.status = status
    }

    if (type) {
      where.type = type
    }

    // Single date filter (for daily view)
    // Parse date as local time by appending time component (otherwise "YYYY-MM-DD" is parsed as UTC)
    if (date) {
      const dayStart = new Date(date + "T00:00:00")
      const dayEnd = new Date(date + "T23:59:59.999")
      where.scheduledAt = {
        gte: dayStart,
        lte: dayEnd,
      }
    } else {
      // Range filters (also parse as local time)
      if (startDate) {
        where.scheduledAt = {
          ...(where.scheduledAt as Record<string, unknown>),
          gte: new Date(startDate + "T00:00:00"),
        }
      }

      if (endDate) {
        where.scheduledAt = {
          ...(where.scheduledAt as Record<string, unknown>),
          lte: new Date(endDate + "T23:59:59.999"),
        }
      }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            consentWhatsApp: true,
            consentEmail: true,
          },
        },
        professionalProfile: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        recurrence: {
          select: {
            id: true,
            recurrenceType: true,
            recurrenceEndType: true,
            occurrences: true,
            endDate: true,
            isActive: true,
            exceptions: true,
            dayOfWeek: true,
            startTime: true,
          },
        },
        additionalProfessionals: {
          select: {
            professionalProfile: {
              select: {
                id: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
    })

    // For BIWEEKLY appointments, find the "paired" patient on the alternate week
    // by looking at actual appointments ±7 days (same professional, same time, different patient)
    const biweeklyAppointments = appointments.filter(
      apt => apt.recurrence?.recurrenceType === "BIWEEKLY" && apt.recurrence.isActive && apt.type === "CONSULTA" && apt.patientId
    )

    const pairedInfoMap = new Map<string, { id: string | null; name: string | null }>()

    if (biweeklyAppointments.length > 0) {
      // Collect unique adjacent-week date strings for all biweekly appointments
      const msPerDay = 24 * 60 * 60 * 1000
      const adjacentDateStrs = new Set<string>()
      for (const apt of biweeklyAppointments) {
        const t = apt.scheduledAt.getTime()
        for (const offset of [-7, 7]) {
          const d = new Date(t + offset * msPerDay)
          adjacentDateStrs.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)
        }
      }

      const adjacentAppointments = await prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          recurrenceId: { not: null },
          recurrence: {
            recurrenceType: "BIWEEKLY",
            isActive: true,
          },
          type: "CONSULTA",
          status: { notIn: ["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL"] },
          OR: [...adjacentDateStrs].map(ds => ({
            scheduledAt: {
              gte: new Date(ds + "T00:00:00"),
              lte: new Date(ds + "T23:59:59.999"),
            },
          })),
        },
        select: {
          id: true,
          scheduledAt: true,
          professionalProfileId: true,
          patientId: true,
          patient: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      // Match each biweekly appointment with its pair on the adjacent week
      for (const apt of biweeklyAppointments) {
        const aptHours = apt.scheduledAt.getHours()
        const aptMinutes = apt.scheduledAt.getMinutes()
        const aptTime = apt.scheduledAt.getTime()

        const paired = adjacentAppointments.find(adj => {
          if (adj.professionalProfileId !== apt.professionalProfileId) return false
          if (adj.patientId === apt.patientId) return false
          if (adj.scheduledAt.getHours() !== aptHours || adj.scheduledAt.getMinutes() !== aptMinutes) return false
          // Verify it's exactly ±7 days away (within same day tolerance)
          const daysDiff = Math.abs(adj.scheduledAt.getTime() - aptTime) / msPerDay
          return daysDiff > 6 && daysDiff < 8
        })

        pairedInfoMap.set(apt.id, {
          id: paired?.id || null,
          name: paired?.patient?.name || null,
        })
      }
    }

    // Map appointments with alternate week info
    const appointmentsWithAlternateInfo = appointments.map(apt => {
      if (apt.recurrence?.recurrenceType !== "BIWEEKLY" || !apt.recurrence.isActive || !apt.patient) {
        return apt
      }

      const paired = pairedInfoMap.get(apt.id)

      return {
        ...apt,
        alternateWeekInfo: {
          pairedAppointmentId: paired?.id || null,
          pairedPatientName: paired?.name || null,
          isAvailable: !paired?.name,
        },
      }
    })

    // Compute biweeklyHints: for biweekly appointments on adjacent weeks (±7 days) that
    // have NO matching appointment on the current date, emit a hint for the empty slot
    const biweeklyHints: { time: string; professionalProfileId: string; patientName: string; appointmentId: string }[] = []

    if (date) {
      const msPerDay = 24 * 60 * 60 * 1000
      const currentDayStart = new Date(date + "T00:00:00")
      const prevDateStr = new Date(currentDayStart.getTime() - 7 * msPerDay).toISOString().split("T")[0]
      const nextDateStr = new Date(currentDayStart.getTime() + 7 * msPerDay).toISOString().split("T")[0]

      const adjacentBiweekly = await prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          recurrenceId: { not: null },
          recurrence: { recurrenceType: "BIWEEKLY", isActive: true },
          type: "CONSULTA",
          status: { notIn: ["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL"] },
          patientId: { not: null },
          OR: [
            { scheduledAt: { gte: new Date(prevDateStr + "T00:00:00"), lte: new Date(prevDateStr + "T23:59:59.999") } },
            { scheduledAt: { gte: new Date(nextDateStr + "T00:00:00"), lte: new Date(nextDateStr + "T23:59:59.999") } },
          ],
          ...(where.professionalProfileId ? { professionalProfileId: where.professionalProfileId as string } : {}),
        },
        select: {
          id: true,
          scheduledAt: true,
          professionalProfileId: true,
          patient: { select: { name: true } },
        },
      })

      // Build a set of (professionalProfileId, HH:mm) that already have appointments on the current date
      const currentSlots = new Set<string>()
      for (const apt of appointments) {
        const h = String(apt.scheduledAt.getHours()).padStart(2, "0")
        const m = String(apt.scheduledAt.getMinutes()).padStart(2, "0")
        currentSlots.add(`${apt.professionalProfileId}|${h}:${m}`)
      }

      for (const adj of adjacentBiweekly) {
        const h = String(adj.scheduledAt.getHours()).padStart(2, "0")
        const m = String(adj.scheduledAt.getMinutes()).padStart(2, "0")
        const timeStr = `${h}:${m}`
        const slotKey = `${adj.professionalProfileId}|${timeStr}`

        // Only emit hint if the current date has no appointment at that time+professional
        if (!currentSlots.has(slotKey) && adj.patient?.name) {
          const alreadyHinted = biweeklyHints.some(
            hint => hint.time === timeStr && hint.professionalProfileId === adj.professionalProfileId
          )
          if (!alreadyHinted) {
            biweeklyHints.push({
              time: timeStr,
              professionalProfileId: adj.professionalProfileId,
              patientName: adj.patient.name,
              appointmentId: adj.id,
            })
          }
        }
      }
    }

    return NextResponse.json({ appointments: appointmentsWithAlternateInfo, biweeklyHints })
  }
)

/**
 * POST /api/appointments
 * Create a new appointment or calendar entry
 *
 * For CONSULTA (default):
 * - patientId: string (required)
 * - professionalProfileId: string (optional for professionals, required for admins when not targeting self)
 * - date: string (YYYY-MM-DD) (required)
 * - startTime: string (HH:mm) (required)
 * - duration: number (minutes, optional - defaults to professional's appointmentDuration)
 * - modality: "ONLINE" | "PRESENCIAL" (required)
 * - notes: string (optional)
 * - recurrence: object (optional)
 *
 * For TAREFA, LEMBRETE, NOTA, REUNIAO:
 * - type: string (required)
 * - title: string (required)
 * - date, startTime, duration, notes, recurrence (WEEKLY only)
 * - professionalProfileId (optional)
 */
export const POST = withAuth(
  { resource: "appointment", action: "create" },
  async (req, { user, scope }) => {
    const body = await req.json()

    // Determine if this is a calendar entry or a regular appointment
    const isCalendarEntry = body.type && body.type !== "CONSULTA"

    if (isCalendarEntry) {
      return handleCreateCalendarEntry(body, user, scope, req)
    }

    return handleCreateAppointment(body, user, scope, req)
  }
)

/**
 * Handle creating a calendar entry (TAREFA, LEMBRETE, NOTA, REUNIAO)
 */
async function handleCreateCalendarEntry(
  body: unknown,
  user: AuthUser,
  scope: string,
  req: Request
) {
  const validation = createCalendarEntrySchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: "Dados invalidos", details: validation.error.flatten() },
      { status: 400 }
    )
  }

  const { type, title, date, startTime, duration, notes, recurrence } = validation.data

  // Determine professionalProfileId
  let targetProfessionalProfileId = validation.data.professionalProfileId
  if (!targetProfessionalProfileId && user.professionalProfileId) {
    targetProfessionalProfileId = user.professionalProfileId
  }
  if (!targetProfessionalProfileId) {
    return NextResponse.json(
      { error: "professionalProfileId is required" },
      { status: 400 }
    )
  }

  // Validate professional belongs to clinic
  const professional = await prisma.professionalProfile.findFirst({
    where: {
      id: targetProfessionalProfileId,
      user: { clinicId: user.clinicId },
    },
    select: {
      id: true,
      appointmentDuration: true,
      user: { select: { name: true } },
    },
  })

  if (!professional) {
    return NextResponse.json(
      { error: "Profissional não encontrado na sua clínica" },
      { status: 404 }
    )
  }

  if (scope === "own" && targetProfessionalProfileId !== user.professionalProfileId) {
    return NextResponse.json(
      { error: "Você só pode criar entradas para si mesmo" },
      { status: 403 }
    )
  }

  // Process additional professionals (only for REUNIAO)
  let additionalProfessionalIds: string[] = []
  if (type === "REUNIAO" && validation.data.additionalProfessionalIds?.length) {
    // Filter out primary professional to prevent duplicates
    additionalProfessionalIds = validation.data.additionalProfessionalIds.filter(
      id => id !== targetProfessionalProfileId
    )
    if (additionalProfessionalIds.length > 0) {
      const validProfs = await prisma.professionalProfile.findMany({
        where: {
          id: { in: additionalProfessionalIds },
          user: { clinicId: user.clinicId },
        },
        select: { id: true },
      })
      const validIds = new Set(validProfs.map(p => p.id))
      additionalProfessionalIds = additionalProfessionalIds.filter(id => validIds.has(id))
    }
  }

  const entryDuration = duration || DEFAULT_DURATIONS[type] || 60
  const blocksTime = getBlocksTime(type as AppointmentType)

  // Validate date is not in the past
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const appointmentDate = new Date(date + "T00:00:00")
  appointmentDate.setHours(0, 0, 0, 0)

  if (appointmentDate < today) {
    return NextResponse.json(
      { error: "Não é possível criar entradas no passado" },
      { status: 400 }
    )
  }

  // Calculate dates
  const appointmentDates = recurrence
    ? calculateRecurrenceDates(date, startTime, entryDuration, {
        recurrenceType: recurrence.recurrenceType as RecurrenceType,
        recurrenceEndType: recurrence.recurrenceEndType as RecurrenceEndType,
        endDate: recurrence.endDate,
        occurrences: recurrence.occurrences,
      })
    : [{
        date,
        scheduledAt: new Date(`${date}T${startTime}:00`),
        endAt: new Date(new Date(`${date}T${startTime}:00`).getTime() + entryDuration * 60 * 1000),
      }]

  // Use transaction (increased timeout for recurring appointments with many occurrences)
  const result = await prisma.$transaction(async (tx) => {
    // Check conflicts only for time-blocking entries — bulk check all dates at once
    if (blocksTime) {
      const bulkResult = await checkConflictsBulk({
        professionalProfileId: targetProfessionalProfileId,
        dates: appointmentDates.map(d => ({ scheduledAt: d.scheduledAt, endAt: d.endAt })),
        additionalProfessionalIds,
      }, tx)

      if (bulkResult.conflicts.length > 0) {
        const first = bulkResult.conflicts[0]
        return {
          conflict: first.conflictingAppointment,
          conflictDate: appointmentDates[first.index].date,
          occurrenceIndex: first.index + 1,
        }
      }
    }

    // Create recurrence record if recurring
    let recurrenceId: string | null = null
    if (recurrence) {
      const firstDate = appointmentDates[0]
      const dayOfWeek = firstDate.scheduledAt.getDay()
      const apptEndTime = `${String(firstDate.endAt.getHours()).padStart(2, "0")}:${String(firstDate.endAt.getMinutes()).padStart(2, "0")}`

      const lastGeneratedDate = recurrence.recurrenceEndType === "INDEFINITE"
        ? new Date(appointmentDates[appointmentDates.length - 1].date)
        : null

      const recurrenceRecord = await tx.appointmentRecurrence.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: targetProfessionalProfileId,
          type: type as AppointmentType,
          title,
          modality: null,
          dayOfWeek,
          startTime,
          endTime: apptEndTime,
          duration: entryDuration,
          recurrenceType: recurrence.recurrenceType as RecurrenceType,
          recurrenceEndType: recurrence.recurrenceEndType as RecurrenceEndType,
          startDate: new Date(appointmentDates[0].date),
          endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
          occurrences: recurrence.occurrences || null,
          lastGeneratedDate,
        },
      })
      recurrenceId = recurrenceRecord.id

      // Create recurrence professional records for additional professionals
      if (additionalProfessionalIds.length > 0) {
        await tx.recurrenceProfessional.createMany({
          data: additionalProfessionalIds.map(profId => ({
            recurrenceId: recurrenceRecord.id,
            professionalProfileId: profId,
          })),
        })
      }
    }

    // Bulk create all entries
    await tx.appointment.createMany({
      data: appointmentDates.map(apptDate => ({
        clinicId: user.clinicId,
        professionalProfileId: targetProfessionalProfileId,
        type: type as AppointmentType,
        title,
        blocksTime,
        recurrenceId,
        scheduledAt: apptDate.scheduledAt,
        endAt: apptDate.endAt,
        modality: null,
        notes: notes || null,
      })),
    })

    // Fetch created appointments with includes for the response
    const createdAppointments = await tx.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        professionalProfileId: targetProfessionalProfileId,
        recurrenceId: recurrenceId ?? undefined,
        scheduledAt: {
          gte: appointmentDates[0].scheduledAt,
          lte: appointmentDates[appointmentDates.length - 1].scheduledAt,
        },
        ...(recurrenceId ? {} : {
          scheduledAt: appointmentDates[0].scheduledAt,
          endAt: appointmentDates[0].endAt,
        }),
      },
      include: {
        professionalProfile: {
          select: {
            id: true,
            user: { select: { name: true } },
          },
        },
        additionalProfessionals: {
          select: {
            professionalProfile: {
              select: { id: true, user: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    })

    // Create additional professional records for each created appointment
    if (additionalProfessionalIds.length > 0) {
      await tx.appointmentProfessional.createMany({
        data: createdAppointments.flatMap(apt =>
          additionalProfessionalIds.map(profId => ({
            appointmentId: apt.id,
            professionalProfileId: profId,
          }))
        ),
      })
    }

    return { appointments: createdAppointments, recurrenceId }
  }, { timeout: 30000 })

  // Check for conflict
  if ("conflict" in result && result.conflict) {
    return NextResponse.json(
      {
        ...formatConflictError(result.conflict),
        conflictDate: "conflictDate" in result ? result.conflictDate : undefined,
        occurrenceIndex: "occurrenceIndex" in result ? result.occurrenceIndex : undefined,
      },
      { status: 409 }
    )
  }

  // Audit log
  for (let i = 0; i < result.appointments.length; i++) {
    const entry = result.appointments[i]
    await audit.log({
      user,
      action: AuditAction.APPOINTMENT_CREATED,
      entityType: "Appointment",
      entityId: entry.id,
      newValues: {
        type,
        title,
        blocksTime,
        professionalProfileId: targetProfessionalProfileId,
        professionalName: professional.user.name,
        scheduledAt: entry.scheduledAt.toISOString(),
        endAt: entry.endAt.toISOString(),
        recurrenceId: result.recurrenceId,
        isRecurring: !!recurrence,
      },
      request: req,
    })
  }

  // No notifications for non-patient entries

  if (recurrence) {
    return NextResponse.json({
      appointments: result.appointments,
      recurrenceId: result.recurrenceId,
      totalOccurrences: result.appointments.length,
    }, { status: 201 })
  }

  return NextResponse.json({
    appointment: result.appointments[0],
  }, { status: 201 })
}

/**
 * Handle creating a regular CONSULTA appointment (existing flow, unchanged)
 */
async function handleCreateAppointment(
  body: unknown,
  user: AuthUser,
  scope: string,
  req: Request
) {
  // Validate request body
  const validation = createAppointmentSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: validation.error.flatten() },
      { status: 400 }
    )
  }

  const { patientId, date, startTime, duration, modality, notes, recurrence } = validation.data

  // Determine professionalProfileId
  let targetProfessionalProfileId = validation.data.professionalProfileId

  // If professional doesn't specify professionalProfileId, use their own
  if (!targetProfessionalProfileId && user.professionalProfileId) {
    targetProfessionalProfileId = user.professionalProfileId
  }

  if (!targetProfessionalProfileId) {
    return NextResponse.json(
      { error: "professionalProfileId is required" },
      { status: 400 }
    )
  }

  // Validate that the professional belongs to the same clinic
  const professional = await prisma.professionalProfile.findFirst({
    where: {
      id: targetProfessionalProfileId,
      user: {
        clinicId: user.clinicId,
      },
    },
    select: {
      id: true,
      appointmentDuration: true,
      bufferBetweenSlots: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  })

  if (!professional) {
    return NextResponse.json(
      { error: "Profissional não encontrado na sua clínica" },
      { status: 404 }
    )
  }

  // If scope is "own", professional can only create appointments for themselves
  if (scope === "own" && targetProfessionalProfileId !== user.professionalProfileId) {
    return NextResponse.json(
      { error: "Você só pode criar agendamentos para si mesmo" },
      { status: 403 }
    )
  }

  // Process additional professionals for CONSULTA
  let additionalProfessionalIds: string[] = []
  if (validation.data.additionalProfessionalIds?.length) {
    additionalProfessionalIds = validation.data.additionalProfessionalIds.filter(
      id => id !== targetProfessionalProfileId
    )
    if (additionalProfessionalIds.length > 0) {
      const validProfs = await prisma.professionalProfile.findMany({
        where: {
          id: { in: additionalProfessionalIds },
          user: { clinicId: user.clinicId },
        },
        select: { id: true },
      })
      const validIds = new Set(validProfs.map(p => p.id))
      additionalProfessionalIds = additionalProfessionalIds.filter(id => validIds.has(id))
    }
  }

  // Validate that the patient belongs to the same clinic and is active
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      clinicId: user.clinicId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      consentWhatsApp: true,
      consentEmail: true,
    },
  })

  if (!patient) {
    return NextResponse.json(
      { error: "Paciente não encontrado ou inativo na sua clínica" },
      { status: 404 }
    )
  }

  // Calculate appointment times
  const appointmentDuration = duration || professional.appointmentDuration

  // Validate appointment date is not in the past
  // Parse date as local time by appending T00:00:00 (otherwise "YYYY-MM-DD" is parsed as UTC)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const appointmentDate = new Date(date + "T00:00:00")
  appointmentDate.setHours(0, 0, 0, 0)

  if (appointmentDate < today) {
    return NextResponse.json(
      { error: "Não é possível agendar consultas no passado" },
      { status: 400 }
    )
  }

  // Validate recurrence options if provided
  if (recurrence) {
    const recurrenceValidation = validateRecurrenceOptions({
      recurrenceType: recurrence.recurrenceType as RecurrenceType,
      recurrenceEndType: recurrence.recurrenceEndType as RecurrenceEndType,
      endDate: recurrence.endDate,
      occurrences: recurrence.occurrences,
    })

    if (!recurrenceValidation.valid) {
      return NextResponse.json(
        { error: recurrenceValidation.error },
        { status: 400 }
      )
    }
  }

  // Calculate all dates (single or recurring)
  const appointmentDates = recurrence
    ? calculateRecurrenceDates(date, startTime, appointmentDuration, {
        recurrenceType: recurrence.recurrenceType as RecurrenceType,
        recurrenceEndType: recurrence.recurrenceEndType as RecurrenceEndType,
        endDate: recurrence.endDate,
        occurrences: recurrence.occurrences,
      })
    : [{
        date,
        scheduledAt: new Date(`${date}T${startTime}:00`),
        endAt: new Date(new Date(`${date}T${startTime}:00`).getTime() + appointmentDuration * 60 * 1000),
      }]

  // Validate ALL appointment dates against availability before creating any
  const allAvailabilityRules = await prisma.availabilityRule.findMany({
    where: {
      professionalProfileId: targetProfessionalProfileId,
      isActive: true,
    },
  })

  // Get all exception dates in the range
  const startDateRange = new Date(appointmentDates[0].date)
  const endDateRange = new Date(appointmentDates[appointmentDates.length - 1].date)

  const allExceptions = await prisma.availabilityException.findMany({
    where: {
      professionalProfileId: targetProfessionalProfileId,
      date: {
        gte: startDateRange,
        lte: endDateRange,
      },
      isAvailable: false,
    },
  })

  // Validate each appointment date
  for (let i = 0; i < appointmentDates.length; i++) {
    const apptDate = appointmentDates[i]
    const dayOfWeek = apptDate.scheduledAt.getDay()
    const apptStartTime = `${String(apptDate.scheduledAt.getHours()).padStart(2, "0")}:${String(apptDate.scheduledAt.getMinutes()).padStart(2, "0")}`
    const apptEndTime = `${String(apptDate.endAt.getHours()).padStart(2, "0")}:${String(apptDate.endAt.getMinutes()).padStart(2, "0")}`

    // Check availability rules for this day
    const dayRules = allAvailabilityRules.filter(rule => rule.dayOfWeek === dayOfWeek)

    if (dayRules.length === 0) {
      return NextResponse.json(
        {
          error: `Profissional nao disponivel em ${apptDate.scheduledAt.toLocaleDateString("pt-BR")} (${["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"][dayOfWeek]})`,
          conflictDate: apptDate.date,
          occurrenceIndex: i + 1,
        },
        { status: 400 }
      )
    }

    // Check if time is within availability
    const isWithinAvailability = dayRules.some(rule =>
      apptStartTime >= rule.startTime && apptEndTime <= rule.endTime
    )

    if (!isWithinAvailability) {
      return NextResponse.json(
        {
          error: `Horario fora da disponibilidade em ${apptDate.scheduledAt.toLocaleDateString("pt-BR")}`,
          conflictDate: apptDate.date,
          occurrenceIndex: i + 1,
        },
        { status: 400 }
      )
    }

    // Check exceptions for this date (specific date exceptions and recurring exceptions)
    const dateStr = apptDate.date
    const dayExceptions = allExceptions.filter(ex => {
      // For recurring exceptions, match by day of week
      if (ex.isRecurring) {
        return ex.dayOfWeek === dayOfWeek
      }
      // For specific date exceptions, match by date
      if (ex.date) {
        const exDate = new Date(ex.date)
        const exDateStr = `${exDate.getFullYear()}-${String(exDate.getMonth() + 1).padStart(2, "0")}-${String(exDate.getDate()).padStart(2, "0")}`
        return exDateStr === dateStr
      }
      return false
    })

    for (const exception of dayExceptions) {
      // Full-day block
      if (!exception.startTime || !exception.endTime) {
        return NextResponse.json(
          {
            error: exception.reason || `Profissional nao disponivel em ${apptDate.scheduledAt.toLocaleDateString("pt-BR")}`,
            conflictDate: apptDate.date,
            occurrenceIndex: i + 1,
          },
          { status: 400 }
        )
      }

      // Time-specific block
      if (apptStartTime < exception.endTime && apptEndTime > exception.startTime) {
        return NextResponse.json(
          {
            error: exception.reason || `Horario bloqueado em ${apptDate.scheduledAt.toLocaleDateString("pt-BR")}`,
            conflictDate: apptDate.date,
            occurrenceIndex: i + 1,
          },
          { status: 400 }
        )
      }
    }
  }

  // Use transaction with database-level locking to prevent race conditions
  // Increased timeout for recurring appointments with many occurrences
  const result = await prisma.$transaction(async (tx) => {
    // Bulk check ALL appointments for conflicts in a single query
    const bulkConflictResult = await checkConflictsBulk({
      professionalProfileId: targetProfessionalProfileId,
      dates: appointmentDates.map(d => ({ scheduledAt: d.scheduledAt, endAt: d.endAt })),
      additionalProfessionalIds,
    }, tx)

    if (bulkConflictResult.conflicts.length > 0) {
      const first = bulkConflictResult.conflicts[0]
      return {
        conflict: first.conflictingAppointment,
        conflictDate: appointmentDates[first.index].date,
        occurrenceIndex: first.index + 1,
      }
    }

    // Create recurrence record if this is a recurring appointment
    let recurrenceId: string | null = null

    if (recurrence) {
      const firstDate = appointmentDates[0]
      const dayOfWeek = firstDate.scheduledAt.getDay()
      const apptEndTime = `${String(firstDate.endAt.getHours()).padStart(2, "0")}:${String(firstDate.endAt.getMinutes()).padStart(2, "0")}`

      // For INDEFINITE recurrences, track the last generated date
      const lastGeneratedDate = recurrence.recurrenceEndType === "INDEFINITE"
        ? new Date(appointmentDates[appointmentDates.length - 1].date)
        : null

      const recurrenceRecord = await tx.appointmentRecurrence.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: targetProfessionalProfileId,
          patientId,
          modality,
          dayOfWeek,
          startTime,
          endTime: apptEndTime,
          duration: appointmentDuration,
          recurrenceType: recurrence.recurrenceType as RecurrenceType,
          recurrenceEndType: recurrence.recurrenceEndType as RecurrenceEndType,
          startDate: new Date(appointmentDates[0].date),
          endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
          occurrences: recurrence.occurrences || null,
          lastGeneratedDate,
        },
      })
      recurrenceId = recurrenceRecord.id

      // Create recurrence professional records for additional professionals
      if (additionalProfessionalIds.length > 0) {
        await tx.recurrenceProfessional.createMany({
          data: additionalProfessionalIds.map(profId => ({
            recurrenceId: recurrenceRecord.id,
            professionalProfileId: profId,
          })),
        })
      }
    }

    // Bulk create all appointments
    await tx.appointment.createMany({
      data: appointmentDates.map(apptDate => ({
        clinicId: user.clinicId,
        professionalProfileId: targetProfessionalProfileId,
        patientId,
        recurrenceId,
        scheduledAt: apptDate.scheduledAt,
        endAt: apptDate.endAt,
        modality,
        notes: notes || null,
      })),
    })

    // Fetch created appointments with includes for the response
    const createdAppointments = await tx.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        professionalProfileId: targetProfessionalProfileId,
        patientId,
        ...(recurrenceId
          ? { recurrenceId }
          : {
              scheduledAt: appointmentDates[0].scheduledAt,
              endAt: appointmentDates[0].endAt,
            }),
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        professionalProfile: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        additionalProfessionals: {
          select: {
            professionalProfile: {
              select: { id: true, user: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    })

    // Create additional professional records for each created appointment
    if (additionalProfessionalIds.length > 0) {
      await tx.appointmentProfessional.createMany({
        data: createdAppointments.flatMap(apt =>
          additionalProfessionalIds.map(profId => ({
            appointmentId: apt.id,
            professionalProfileId: profId,
          }))
        ),
      })
    }

    // Bulk create tokens for all appointments
    await createBulkAppointmentTokens(
      createdAppointments.map(a => ({ id: a.id, scheduledAt: a.scheduledAt })),
      tx
    )

    // Fetch the first appointment's tokens for the notification
    const firstAppointmentTokens = await tx.appointmentToken.findMany({
      where: {
        appointmentId: createdAppointments[0].id,
      },
    })

    const confirmToken = firstAppointmentTokens.find(t => t.action === "confirm")?.token || ""
    const cancelToken = firstAppointmentTokens.find(t => t.action === "cancel")?.token || ""
    const expiresAt = firstAppointmentTokens[0]?.expiresAt || new Date()

    // Update patient's lastVisitAt
    await tx.patient.update({
      where: { id: patientId },
      data: { lastVisitAt: new Date() },
    })

    return {
      appointments: createdAppointments,
      tokens: [{ confirmToken, cancelToken, expiresAt }],
      recurrenceId,
    }
  }, { timeout: 30000 })

  // Check if conflict was detected within the transaction
  if ("conflict" in result && result.conflict) {
    return NextResponse.json(
      {
        ...formatConflictError(result.conflict),
        conflictDate: "conflictDate" in result ? result.conflictDate : undefined,
        occurrenceIndex: "occurrenceIndex" in result ? result.occurrenceIndex : undefined,
      },
      { status: 409 }
    )
  }

  // Create audit log for each appointment
  for (let i = 0; i < result.appointments.length; i++) {
    const appointment = result.appointments[i]
    await audit.log({
      user,
      action: AuditAction.APPOINTMENT_CREATED,
      entityType: "Appointment",
      entityId: appointment.id,
      newValues: {
        patientId,
        patientName: patient.name,
        professionalProfileId: targetProfessionalProfileId,
        professionalName: professional.user.name,
        scheduledAt: appointment.scheduledAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        modality,
        notes: notes || null,
        recurrenceId: result.recurrenceId,
        isRecurring: !!recurrence,
        occurrenceIndex: recurrence ? i + 1 : undefined,
        totalOccurrences: recurrence ? result.appointments.length : undefined,
      },
      request: req,
    })
  }

  // Queue notifications for first appointment only (for recurring)
  // Subsequent appointments will get reminders via scheduled jobs
  try {
    const firstAppointment = result.appointments[0]
    const firstTokens = result.tokens[0]

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const confirmLink = buildConfirmLink(baseUrl, firstTokens.confirmToken)
    const cancelLink = buildCancelLink(baseUrl, firstTokens.cancelToken)

    const professionalName = firstAppointment.professionalProfile.user.name
    const formattedDate = firstAppointment.scheduledAt.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    const formattedTime = firstAppointment.scheduledAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })

    let notificationContent = `Ola ${patient.name}!\n\nSeu agendamento foi criado com sucesso.\n\n📅 Data: ${formattedDate}\n🕐 Horario: ${formattedTime}\n👨‍⚕️ Profissional: ${professionalName}\n📍 Modalidade: ${modality === "ONLINE" ? "Online" : "Presencial"}`

    if (recurrence) {
      const recurrenceTypeLabels: Record<string, string> = {
        WEEKLY: "Semanal",
        BIWEEKLY: "Quinzenal",
        MONTHLY: "Mensal",
      }
      notificationContent += `\n\n🔁 Agendamento recorrente: ${recurrenceTypeLabels[recurrence.recurrenceType]} (${result.appointments.length} sessoes)`
    }

    notificationContent += `\n\nPara confirmar seu agendamento, acesse:\n${confirmLink}\n\nPara cancelar, acesse:\n${cancelLink}`

    // Queue WhatsApp notification to all phone numbers if patient has consent
    if (patient.consentWhatsApp && patient.phone) {
      getPatientPhoneNumbers(patient.id, user.clinicId).then((phoneNumbers) => {
        for (const { phone } of phoneNumbers) {
          createNotification({
            clinicId: user.clinicId,
            patientId: patient.id,
            appointmentId: firstAppointment.id,
            type: NotificationType.APPOINTMENT_CONFIRMATION,
            channel: NotificationChannel.WHATSAPP,
            recipient: phone,
            content: notificationContent,
          }).catch(() => {
            // Silently ignore - notification failure should not affect appointment creation
          })
        }
      }).catch(() => {
        // Silently ignore
      })
    }

    // Queue email notification if patient has consent
    if (patient.consentEmail && patient.email) {
      createNotification({
        clinicId: user.clinicId,
        patientId: patient.id,
        appointmentId: firstAppointment.id,
        type: NotificationType.APPOINTMENT_CONFIRMATION,
        channel: NotificationChannel.EMAIL,
        recipient: patient.email,
        subject: recurrence
          ? `Agendamento Recorrente Criado - ${result.appointments.length} sessoes`
          : "Agendamento Criado - Confirmacao",
        content: notificationContent,
      }).catch(() => {
        // Silently ignore - notification failure should not affect appointment creation
      })
    }
  } catch {
    // Silently ignore notification errors - appointment creation succeeded
  }

  // Return response based on whether it's recurring or single
  if (recurrence) {
    return NextResponse.json({
      appointments: result.appointments,
      recurrenceId: result.recurrenceId,
      totalOccurrences: result.appointments.length,
      tokens: {
        // Return tokens for first appointment
        confirm: result.tokens[0].confirmToken,
        cancel: result.tokens[0].cancelToken,
        expiresAt: result.tokens[0].expiresAt,
      },
    }, { status: 201 })
  }

  // Single appointment response (backwards compatible)
  return NextResponse.json({
    appointment: result.appointments[0],
    tokens: {
      confirm: result.tokens[0].confirmToken,
      cancel: result.tokens[0].cancelToken,
      expiresAt: result.tokens[0].expiresAt,
    },
  }, { status: 201 })
}
