import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withAuthentication } from "@/lib/api"

/**
 * Schema for validating profile update requests
 */
const updateProfileSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100).optional(),
  phone: z.string().max(20).optional().nullable(),
  specialty: z.string().max(100).optional().nullable(),
  appointmentDuration: z.number().int().min(15).max(180).optional(),
})

/**
 * GET /api/me
 * Returns the current user with their professional profile
 */
export const GET = withAuthentication(async (_req, user) => {
  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      clinic: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      professionalProfile: {
        select: {
          id: true,
          specialty: true,
          registrationNumber: true,
          bio: true,
          appointmentDuration: true,
          bufferBetweenSlots: true,
          allowOnlineBooking: true,
          maxAdvanceBookingDays: true,
        },
      },
    },
  })

  if (!userData) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json({ user: userData })
})

/**
 * PATCH /api/me
 * Update the current user's profile fields
 * Editable fields: name, phone (via clinic), specialty, appointmentDuration
 */
export const PATCH = withAuthentication(async (req, user) => {
  const body = await req.json()

  // Validate input
  const result = updateProfileSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Validation error",
        details: result.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { name, specialty, appointmentDuration } = result.data

  // Update user name if provided
  if (name !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name },
    })
  }

  // Update professional profile if user has one and relevant fields are provided
  if (user.professionalProfileId && (specialty !== undefined || appointmentDuration !== undefined)) {
    const profileData: Record<string, unknown> = {}
    if (specialty !== undefined) profileData.specialty = specialty
    if (appointmentDuration !== undefined) profileData.appointmentDuration = appointmentDuration

    await prisma.professionalProfile.update({
      where: { id: user.professionalProfileId },
      data: profileData,
    })
  }

  // Fetch updated user data
  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      clinic: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      professionalProfile: {
        select: {
          id: true,
          specialty: true,
          registrationNumber: true,
          bio: true,
          appointmentDuration: true,
          bufferBetweenSlots: true,
          allowOnlineBooking: true,
          maxAdvanceBookingDays: true,
        },
      },
    },
  })

  return NextResponse.json({ user: userData })
})
