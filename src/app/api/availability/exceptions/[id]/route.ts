import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"

/**
 * GET /api/availability/exceptions/:id
 * Returns a specific availability exception
 */
export const GET = withAuth(
  { resource: "availability-exception", action: "read" },
  async (req: NextRequest, { user, scope }, params) => {
    const id = params?.id

    if (!id) {
      return NextResponse.json({ error: "Exception ID is required" }, { status: 400 })
    }

    const exception = await prisma.availabilityException.findUnique({
      where: { id },
      include: {
        professionalProfile: {
          include: {
            user: {
              select: { clinicId: true },
            },
          },
        },
      },
    })

    if (!exception) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 })
    }

    // Verify access
    if (scope === "own") {
      // Own scope can't access clinic-wide exceptions
      if (!exception.professionalProfileId || exception.professionalProfileId !== user.professionalProfileId) {
        return forbiddenResponse("You can only view your own exceptions")
      }
    } else if (scope === "clinic") {
      // Clinic-wide exceptions use clinicId, professional-specific use professionalProfile.user.clinicId
      if (exception.clinicId) {
        // Clinic-wide exception
        if (exception.clinicId !== user.clinicId) {
          return forbiddenResponse("Exception not found in your clinic")
        }
      } else if (exception.professionalProfile?.user?.clinicId !== user.clinicId) {
        return forbiddenResponse("Exception not found in your clinic")
      }
    }

    return NextResponse.json({
      exception: {
        id: exception.id,
        date: exception.date,
        isAvailable: exception.isAvailable,
        startTime: exception.startTime,
        endTime: exception.endTime,
        reason: exception.reason,
        createdAt: exception.createdAt,
        isClinicWide: !exception.professionalProfileId,
      },
    })
  }
)

/**
 * DELETE /api/availability/exceptions/:id
 * Removes an availability exception
 */
export const DELETE = withAuth(
  { resource: "availability-exception", action: "delete" },
  async (req: NextRequest, { user, scope }, params) => {
    const id = params?.id

    if (!id) {
      return NextResponse.json({ error: "Exception ID is required" }, { status: 400 })
    }

    const exception = await prisma.availabilityException.findUnique({
      where: { id },
      include: {
        professionalProfile: {
          include: {
            user: {
              select: { clinicId: true },
            },
          },
        },
      },
    })

    if (!exception) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 })
    }

    // Verify access
    if (scope === "own") {
      // Own scope can't delete clinic-wide exceptions
      if (!exception.professionalProfileId || exception.professionalProfileId !== user.professionalProfileId) {
        return forbiddenResponse("You can only delete your own exceptions")
      }
    } else if (scope === "clinic") {
      // Clinic-wide exceptions use clinicId, professional-specific use professionalProfile.user.clinicId
      if (exception.clinicId) {
        // Clinic-wide exception
        if (exception.clinicId !== user.clinicId) {
          return forbiddenResponse("Exception not found in your clinic")
        }
      } else if (exception.professionalProfile?.user?.clinicId !== user.clinicId) {
        return forbiddenResponse("Exception not found in your clinic")
      }
    }

    await prisma.availabilityException.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  }
)
