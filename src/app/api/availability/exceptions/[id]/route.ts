import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"

/**
 * GET /api/availability/exceptions/:id
 * Returns a specific availability exception
 */
export const GET = withFeatureAuth(
  { feature: "availability_own", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.availability_others, "READ")
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

    // Verify access - clinic-wide exceptions use clinicId, professional-specific use professionalProfile.user.clinicId
    if (exception.clinicId) {
      // Clinic-wide exception - verify it belongs to user's clinic
      if (exception.clinicId !== user.clinicId) {
        return forbiddenResponse("Exception not found in your clinic")
      }
      // Clinic-wide exceptions require availability_others permission to view
      if (!canSeeOthers) {
        return forbiddenResponse("You can only view your own exceptions")
      }
    } else if (exception.professionalProfile?.user?.clinicId !== user.clinicId) {
      return forbiddenResponse("Exception not found in your clinic")
    } else if (!canSeeOthers) {
      // Professional-specific exception - own access can only view their own
      if (!exception.professionalProfileId || exception.professionalProfileId !== user.professionalProfileId) {
        return forbiddenResponse("You can only view your own exceptions")
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
export const DELETE = withFeatureAuth(
  { feature: "availability_own", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.availability_others, "WRITE")
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

    // Verify access - clinic-wide exceptions use clinicId, professional-specific use professionalProfile.user.clinicId
    if (exception.clinicId) {
      // Clinic-wide exception - verify it belongs to user's clinic
      if (exception.clinicId !== user.clinicId) {
        return forbiddenResponse("Exception not found in your clinic")
      }
      // Clinic-wide exceptions require availability_others permission to delete
      if (!canSeeOthers) {
        return forbiddenResponse("You can only delete your own exceptions")
      }
    } else if (exception.professionalProfile?.user?.clinicId !== user.clinicId) {
      return forbiddenResponse("Exception not found in your clinic")
    } else if (!canSeeOthers) {
      // Professional-specific exception - own access can only delete their own
      if (!exception.professionalProfileId || exception.professionalProfileId !== user.professionalProfileId) {
        return forbiddenResponse("You can only delete your own exceptions")
      }
    }

    await prisma.availabilityException.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  }
)
