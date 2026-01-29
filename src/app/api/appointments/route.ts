import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"
import { checkConflict, formatConflictError, createAppointmentTokens, buildConfirmLink, buildCancelLink, validateRecurrenceOptions, calculateRecurrenceDates } from "@/lib/appointments"
import { createNotification } from "@/lib/notifications"
import { NotificationChannel, NotificationType, RecurrenceType, RecurrenceEndType } from "@/generated/prisma/client"
import { audit, AuditAction } from "@/lib/rbac"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const recurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES"]),
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
  recurrence: recurrenceSchema.optional(),
})

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

    // Base query always filters by clinic for multi-tenant isolation
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // If scope is "own", filter to only the professional's appointments
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (professionalProfileId && scope === "clinic") {
      // ADMIN can filter by specific professional
      where.professionalProfileId = professionalProfileId
    }

    // Apply optional filters
    if (status) {
      where.status = status
    }

    // Single date filter (for daily view)
    if (date) {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      where.scheduledAt = {
        gte: dayStart,
        lte: dayEnd,
      }
    } else {
      // Range filters
      if (startDate) {
        where.scheduledAt = {
          ...(where.scheduledAt as Record<string, unknown>),
          gte: new Date(startDate),
        }
      }

      if (endDate) {
        where.scheduledAt = {
          ...(where.scheduledAt as Record<string, unknown>),
          lte: new Date(endDate),
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
      },
      orderBy: {
        scheduledAt: "asc",
      },
    })

    return NextResponse.json({ appointments })
  }
)

/**
 * POST /api/appointments
 * Create a new appointment - ADMIN can create for any professional, PROFESSIONAL only for themselves
 *
 * Request body:
 * - patientId: string (required)
 * - professionalProfileId: string (optional for professionals, required for admins when not targeting self)
 * - date: string (YYYY-MM-DD) (required)
 * - startTime: string (HH:mm) (required)
 * - duration: number (minutes, optional - defaults to professional's appointmentDuration)
 * - modality: "ONLINE" | "PRESENCIAL" (required)
 * - notes: string (optional)
 * - recurrence: object (optional) - for recurring appointments
 *   - recurrenceType: "WEEKLY" | "BIWEEKLY" | "MONTHLY"
 *   - recurrenceEndType: "BY_DATE" | "BY_OCCURRENCES"
 *   - endDate: string (YYYY-MM-DD) - required if BY_DATE
 *   - occurrences: number (1-52) - required if BY_OCCURRENCES
 *
 * Validations:
 * 1. Professional must exist in the same clinic
 * 2. Patient must exist and be active in the same clinic
 * 3. Time slot must be within professional's availability rules
 * 4. No double-booking (overlapping appointments)
 * 5. No booking during blocked exceptions
 * 6. For recurring: validates ALL instances against availability (fails if any conflict)
 */
export const POST = withAuth(
  { resource: "appointment", action: "create" },
  async (req, { user, scope }) => {
    const body = await req.json()

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
        { error: "Professional not found in your clinic" },
        { status: 404 }
      )
    }

    // If scope is "own", professional can only create appointments for themselves
    if (scope === "own" && targetProfessionalProfileId !== user.professionalProfileId) {
      return NextResponse.json(
        { error: "You can only create appointments for yourself" },
        { status: 403 }
      )
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
        { error: "Patient not found or inactive in your clinic" },
        { status: 404 }
      )
    }

    // Calculate appointment times
    const appointmentDuration = duration || professional.appointmentDuration

    // Validate appointment date is not in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const appointmentDate = new Date(date)
    appointmentDate.setHours(0, 0, 0, 0)

    if (appointmentDate < today) {
      return NextResponse.json(
        { error: "Cannot schedule appointments in the past" },
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

      // Check exceptions for this date
      const dateStr = apptDate.date
      const dayExceptions = allExceptions.filter(ex => {
        const exDate = new Date(ex.date)
        const exDateStr = `${exDate.getFullYear()}-${String(exDate.getMonth() + 1).padStart(2, "0")}-${String(exDate.getDate()).padStart(2, "0")}`
        return exDateStr === dateStr
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
    const result = await prisma.$transaction(async (tx) => {
      // Check ALL appointments for conflicts before creating any
      for (let i = 0; i < appointmentDates.length; i++) {
        const apptDate = appointmentDates[i]

        const conflictResult = await checkConflict({
          professionalProfileId: targetProfessionalProfileId,
          scheduledAt: apptDate.scheduledAt,
          endAt: apptDate.endAt,
          bufferMinutes: professional.bufferBetweenSlots || 0,
        }, tx)

        if (conflictResult.hasConflict && conflictResult.conflictingAppointment) {
          return {
            conflict: conflictResult.conflictingAppointment,
            conflictDate: apptDate.date,
            occurrenceIndex: i + 1,
          }
        }
      }

      // Create recurrence record if this is a recurring appointment
      let recurrenceId: string | null = null

      if (recurrence) {
        const firstDate = appointmentDates[0]
        const dayOfWeek = firstDate.scheduledAt.getDay()
        const apptEndTime = `${String(firstDate.endAt.getHours()).padStart(2, "0")}:${String(firstDate.endAt.getMinutes()).padStart(2, "0")}`

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
          },
        })
        recurrenceId = recurrenceRecord.id
      }

      // Create all appointments
      const createdAppointments = []
      const createdTokens = []

      for (const apptDate of appointmentDates) {
        const newAppointment = await tx.appointment.create({
          data: {
            clinicId: user.clinicId,
            professionalProfileId: targetProfessionalProfileId,
            patientId,
            recurrenceId,
            scheduledAt: apptDate.scheduledAt,
            endAt: apptDate.endAt,
            modality,
            notes: notes || null,
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
          },
        })

        // Create tokens for confirm/cancel actions
        const tokens = await createAppointmentTokens(newAppointment.id, apptDate.scheduledAt, tx)

        createdAppointments.push(newAppointment)
        createdTokens.push(tokens)
      }

      // Update patient's lastVisitAt
      await tx.patient.update({
        where: { id: patientId },
        data: { lastVisitAt: new Date() },
      })

      return {
        appointments: createdAppointments,
        tokens: createdTokens,
        recurrenceId,
      }
    })

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

      // Queue WhatsApp notification if patient has consent
      if (patient.consentWhatsApp && patient.phone) {
        createNotification({
          clinicId: user.clinicId,
          patientId: patient.id,
          appointmentId: firstAppointment.id,
          type: NotificationType.APPOINTMENT_CONFIRMATION,
          channel: NotificationChannel.WHATSAPP,
          recipient: patient.phone,
          content: notificationContent,
        }).catch(() => {
          // Silently ignore - notification failure should not affect appointment creation
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
)
