import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { checkConflict, formatConflictError } from "@/lib/appointments"

/**
 * GET /api/appointments/:id
 * Get a specific appointment - ADMIN can view any in clinic, PROFESSIONAL only their own
 */
export const GET = withAuth(
  {
    resource: "appointment",
    action: "read",
    getResourceOwnerId: (_req, params) => params?.id,
  },
  async (req, { user, scope }, params) => {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
      include: {
        patient: true,
        professionalProfile: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // Check ownership for "own" scope
    if (scope === "own" && appointment.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("You can only view your own appointments")
    }

    return NextResponse.json({ appointment })
  }
)

/**
 * PATCH /api/appointments/:id
 * Update an appointment - ADMIN can update any in clinic, PROFESSIONAL only their own
 *
 * If scheduledAt or endAt are updated, performs conflict check with database-level locking.
 */
export const PATCH = withAuth(
  {
    resource: "appointment",
    action: "update",
    getResourceOwnerId: (_req, params) => params?.id,
  },
  async (req, { user, scope }, params) => {
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
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // Check ownership for "own" scope
    if (scope === "own" && existing.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("You can only update your own appointments")
    }

    const body = await req.json()
    const { scheduledAt, endAt, status, modality, notes, cancellationReason } = body

    const updateData: Record<string, unknown> = {}

    if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt)
    if (endAt !== undefined) updateData.endAt = new Date(endAt)
    if (status !== undefined) updateData.status = status
    if (modality !== undefined) updateData.modality = modality
    if (notes !== undefined) updateData.notes = notes
    if (cancellationReason !== undefined) {
      updateData.cancellationReason = cancellationReason
      updateData.cancelledAt = new Date()
    }

    // Check if time is being updated - need conflict check
    const isTimeUpdate = scheduledAt !== undefined || endAt !== undefined
    const newScheduledAt = scheduledAt ? new Date(scheduledAt) : existing.scheduledAt
    const newEndAt = endAt ? new Date(endAt) : existing.endAt

    // Use transaction with conflict check if time is being updated
    const result = await prisma.$transaction(async (tx) => {
      if (isTimeUpdate) {
        const conflictResult = await checkConflict({
          professionalProfileId: existing.professionalProfileId,
          scheduledAt: newScheduledAt,
          endAt: newEndAt,
          excludeAppointmentId: params.id,
          bufferMinutes: existing.professionalProfile?.bufferBetweenSlots || 0,
        }, tx)

        if (conflictResult.hasConflict && conflictResult.conflictingAppointment) {
          return { conflict: conflictResult.conflictingAppointment }
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
        },
      })

      return { appointment: updatedAppointment }
    })

    // Check if conflict was detected within the transaction
    if ("conflict" in result && result.conflict) {
      return NextResponse.json(
        formatConflictError(result.conflict),
        { status: 409 }
      )
    }

    return NextResponse.json({ appointment: result.appointment })
  }
)

/**
 * DELETE /api/appointments/:id
 * Delete an appointment - ADMIN can delete any in clinic, PROFESSIONAL only their own
 */
export const DELETE = withAuth(
  {
    resource: "appointment",
    action: "delete",
    getResourceOwnerId: (_req, params) => params?.id,
  },
  async (_req, { user, scope }, params) => {
    // First, verify the appointment exists and belongs to the clinic
    const existing = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // Check ownership for "own" scope
    if (scope === "own" && existing.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("You can only delete your own appointments")
    }

    await prisma.appointment.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  }
)
