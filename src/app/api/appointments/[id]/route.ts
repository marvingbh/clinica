import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"

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

    const appointment = await prisma.appointment.update({
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

    return NextResponse.json({ appointment })
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
