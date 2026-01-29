import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"

/**
 * GET /api/profile
 * Get the current user's professional profile
 */
export const GET = withAuth(
  { resource: "professional-profile", action: "read" },
  async (_req, { user }) => {
    if (!user.professionalProfileId) {
      return NextResponse.json(
        { error: "No professional profile found for this user" },
        { status: 404 }
      )
    }

    const profile = await prisma.professionalProfile.findUnique({
      where: { id: user.professionalProfileId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        availabilityRules: {
          orderBy: { dayOfWeek: "asc" },
        },
        availabilityExceptions: {
          where: {
            date: { gte: new Date() },
          },
          orderBy: { date: "asc" },
        },
      },
    })

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({ profile })
  }
)

/**
 * PATCH /api/profile
 * Update the current user's professional profile
 */
export const PATCH = withAuth(
  { resource: "professional-profile", action: "update" },
  async (req, { user, scope }) => {
    if (!user.professionalProfileId) {
      return NextResponse.json(
        { error: "No professional profile found for this user" },
        { status: 404 }
      )
    }

    // For "own" scope, we can only update our own profile (which is what we're doing)
    // For "clinic" scope (ADMIN), they should use the /api/professionals/:id endpoint

    if (scope === "clinic") {
      // ADMIN should use the specific professional endpoint
      return forbiddenResponse("Use /api/professionals/:id to update other profiles")
    }

    const body = await req.json()
    const {
      specialty,
      bio,
      appointmentDuration,
      bufferBetweenSlots,
      allowOnlineBooking,
      maxAdvanceBookingDays,
    } = body

    const updateData: Record<string, unknown> = {}

    if (specialty !== undefined) updateData.specialty = specialty
    if (bio !== undefined) updateData.bio = bio
    if (appointmentDuration !== undefined) updateData.appointmentDuration = appointmentDuration
    if (bufferBetweenSlots !== undefined) updateData.bufferBetweenSlots = bufferBetweenSlots
    if (allowOnlineBooking !== undefined) updateData.allowOnlineBooking = allowOnlineBooking
    if (maxAdvanceBookingDays !== undefined)
      updateData.maxAdvanceBookingDays = maxAdvanceBookingDays

    const profile = await prisma.professionalProfile.update({
      where: { id: user.professionalProfileId },
      data: updateData,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ profile })
  }
)
