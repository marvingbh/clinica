import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { checkConflict, formatConflictError, regenerateAppointmentTokens } from "@/lib/appointments"
import { createAuditLog, audit, AuditAction } from "@/lib/rbac/audit"

/**
 * GET /api/appointments/:id
 * Get a specific appointment - ADMIN can view any in clinic, PROFESSIONAL only their own
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            birthDate: true,
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
              select: { id: true, user: { select: { name: true } } },
            },
          },
        },
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // Check ownership if user cannot see others' appointments
    const isParticipant = appointment.additionalProfessionals.some(
      ap => ap.professionalProfile.id === user.professionalProfileId
    )
    if (!canSeeOthers && appointment.professionalProfileId !== user.professionalProfileId && !isParticipant) {
      return forbiddenResponse("You can only view your own appointments")
    }

    return NextResponse.json({ appointment })
  }
)

/**
 * PATCH /api/appointments/:id
 * Update an appointment - ADMIN can update any in clinic, PROFESSIONAL only their own
 *
 * Editable fields: scheduledAt, endAt, status, modality, notes, price, cancellationReason
 * Cannot change: patientId (must cancel and recreate)
 *
 * If scheduledAt or endAt are updated:
 * - Performs conflict check with database-level locking
 * - Regenerates confirmation tokens
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")
    // First, verify the appointment exists and belongs to the clinic
    const existing = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
      include: {
        professionalProfile: {
          select: {
            bufferBetweenSlots: true,
          },
        },
        additionalProfessionals: {
          select: { professionalProfileId: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // Check ownership if user cannot manage others' appointments
    const isParticipant = existing.additionalProfessionals.some(
      ap => ap.professionalProfileId === user.professionalProfileId
    )
    if (!canSeeOthers && existing.professionalProfileId !== user.professionalProfileId && !isParticipant) {
      return forbiddenResponse("You can only update your own appointments")
    }

    const body = await req.json()
    const { scheduledAt, endAt, status, modality, notes, price, cancellationReason, title, additionalProfessionalIds } = body

    // Store old values for audit log (only fields being updated)
    const oldValues: Prisma.JsonObject = {}
    const newValues: Prisma.JsonObject = {}
    const updateData: Record<string, unknown> = {}

    if (scheduledAt !== undefined) {
      oldValues.scheduledAt = existing.scheduledAt.toISOString()
      newValues.scheduledAt = scheduledAt
      updateData.scheduledAt = new Date(scheduledAt)
    }
    if (endAt !== undefined) {
      oldValues.endAt = existing.endAt.toISOString()
      newValues.endAt = endAt
      updateData.endAt = new Date(endAt)
    }
    if (status !== undefined) {
      oldValues.status = existing.status
      newValues.status = status
      updateData.status = status
    }
    if (modality !== undefined) {
      oldValues.modality = existing.modality
      newValues.modality = modality
      updateData.modality = modality
    }
    if (notes !== undefined) {
      oldValues.notes = existing.notes
      newValues.notes = notes
      updateData.notes = notes
    }
    if (price !== undefined) {
      oldValues.price = existing.price?.toString() ?? null
      newValues.price = price
      updateData.price = price !== null ? price : null
    }
    if (cancellationReason !== undefined) {
      oldValues.cancellationReason = existing.cancellationReason
      newValues.cancellationReason = cancellationReason
      updateData.cancellationReason = cancellationReason
      updateData.cancelledAt = new Date()
    }
    if (title !== undefined && existing.type !== "CONSULTA") {
      oldValues.title = existing.title
      newValues.title = title
      updateData.title = title
    }

    // Check if time is being updated - need conflict check
    const isTimeUpdate = scheduledAt !== undefined || endAt !== undefined
    const hasAdditionalProfChange = additionalProfessionalIds !== undefined
    const newScheduledAt = scheduledAt ? new Date(scheduledAt) : existing.scheduledAt
    const newEndAt = endAt ? new Date(endAt) : existing.endAt

    // Use transaction with conflict check if time or professionals are being updated
    // Only check conflicts for entries that block time
    const result = await prisma.$transaction(async (tx) => {
      // Resolve the effective additional professional IDs for conflict checking
      const effectiveAdditionalProfIds = hasAdditionalProfChange
        ? (additionalProfessionalIds as string[]).filter((id: string) => id !== existing.professionalProfileId)
        : existing.additionalProfessionals.map(ap => ap.professionalProfileId)

      // Run conflict check when time changes OR when additional professionals change
      if ((isTimeUpdate || hasAdditionalProfChange) && existing.blocksTime) {
        const conflictResult = await checkConflict({
          professionalProfileId: existing.professionalProfileId,
          scheduledAt: newScheduledAt,
          endAt: newEndAt,
          excludeAppointmentId: params.id,
          excludeGroupId: existing.groupId || undefined,
          additionalProfessionalIds: effectiveAdditionalProfIds,
          bufferMinutes: existing.professionalProfile?.bufferBetweenSlots || 0,
        }, tx)

        if (conflictResult.hasConflict && conflictResult.conflictingAppointment) {
          return { conflict: conflictResult.conflictingAppointment }
        }
      }

      // Update additional professionals if provided
      if (additionalProfessionalIds !== undefined) {
        // Delete existing + recreate pattern
        await tx.appointmentProfessional.deleteMany({
          where: { appointmentId: params.id },
        })
        const filteredIds = (additionalProfessionalIds as string[]).filter(
          (id: string) => id !== existing.professionalProfileId
        )
        if (filteredIds.length > 0) {
          await tx.appointmentProfessional.createMany({
            data: filteredIds.map((profId: string) => ({
              appointmentId: params.id,
              professionalProfileId: profId,
            })),
          })
        }
      }

      const updatedAppointment = await tx.appointment.update({
        where: { id: params.id },
        data: updateData,
        include: {
          patient: {
            select: {
              id: true,
              name: true,
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
      })

      // Regenerate tokens if CONSULTA appointment is rescheduled (time changed)
      let newTokens = null
      if (isTimeUpdate && existing.type === "CONSULTA") {
        newTokens = await regenerateAppointmentTokens(params.id, newScheduledAt, tx)
      }

      return { appointment: updatedAppointment, tokens: newTokens }
    })

    // Check if conflict was detected within the transaction
    if ("conflict" in result && result.conflict) {
      return NextResponse.json(
        formatConflictError(result.conflict),
        { status: 409 }
      )
    }

    // Create audit log entry for the update
    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    await createAuditLog({
      user,
      action: "APPOINTMENT_UPDATED",
      entityType: "Appointment",
      entityId: params.id,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
    })

    // Include new tokens in response if appointment was rescheduled
    const response: Record<string, unknown> = { appointment: result.appointment }
    if (result.tokens) {
      response.tokens = {
        confirm: result.tokens.confirmToken,
        cancel: result.tokens.cancelToken,
        expiresAt: result.tokens.expiresAt,
      }
    }

    return NextResponse.json(response)
  }
)

/**
 * DELETE /api/appointments/:id
 * Delete an appointment - ADMIN can delete any in clinic, PROFESSIONAL only their own
 */
export const DELETE = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")
    // First, verify the appointment exists and belongs to the clinic
    const existing = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
      include: {
        patient: {
          select: { name: true },
        },
        professionalProfile: {
          select: {
            user: { select: { name: true } },
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // Only primary professional or users with agenda_others can delete (participants cannot)
    if (!canSeeOthers && existing.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("You can only delete your own appointments")
    }

    await prisma.appointment.delete({
      where: { id: params.id },
    })

    // Create audit log
    await audit.log({
      user,
      action: AuditAction.APPOINTMENT_DELETED,
      entityType: "Appointment",
      entityId: params.id,
      oldValues: {
        type: existing.type,
        title: existing.title,
        patientId: existing.patientId,
        patientName: existing.patient?.name || null,
        professionalProfileId: existing.professionalProfileId,
        professionalName: existing.professionalProfile.user.name,
        scheduledAt: existing.scheduledAt.toISOString(),
        endAt: existing.endAt.toISOString(),
        status: existing.status,
        modality: existing.modality,
      },
      request: req,
    })

    return NextResponse.json({ success: true })
  }
)
