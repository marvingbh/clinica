import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { hashPassword } from "@/lib/password"

/**
 * GET /api/professionals/:id
 * Get a specific professional - ADMIN only
 */
export const GET = withFeatureAuth(
  { feature: "professionals", minAccess: "READ" },
  async (_req, { user }, params) => {
    const professional = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        professionalProfile: { isNot: null },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
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

    if (!professional) {
      return NextResponse.json({ error: "Professional not found" }, { status: 404 })
    }

    return NextResponse.json({ professional })
  }
)

/**
 * PATCH /api/professionals/:id
 * Update a professional - ADMIN only
 */
export const PATCH = withFeatureAuth(
  { feature: "professionals", minAccess: "WRITE" },
  async (req, { user }, params) => {
    // Verify the professional exists and belongs to the clinic
    const existing = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        professionalProfile: { isNot: null },
      },
      include: {
        professionalProfile: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Professional not found" }, { status: 404 })
    }

    const body = await req.json()
    const {
      name,
      email,
      password,
      isActive,
      role,
      specialty,
      registrationNumber,
      bio,
      appointmentDuration,
      bufferBetweenSlots,
      allowOnlineBooking,
      maxAdvanceBookingDays,
    } = body

    // Check for duplicate email if changing
    if (email && email !== existing.email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          clinicId: user.clinicId,
          email,
          NOT: { id: params.id },
        },
      })

      if (existingEmail) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        )
      }
    }

    // Build update data for User
    const userUpdateData: Record<string, unknown> = {}
    if (name !== undefined) userUpdateData.name = name
    if (email !== undefined) userUpdateData.email = email
    if (isActive !== undefined) userUpdateData.isActive = isActive
    if (role !== undefined && (role === "ADMIN" || role === "PROFESSIONAL")) {
      userUpdateData.role = role
    }
    if (password !== undefined && password.length > 0) {
      userUpdateData.passwordHash = await hashPassword(password)
    }

    // Build update data for ProfessionalProfile
    const profileUpdateData: Record<string, unknown> = {}
    if (specialty !== undefined) profileUpdateData.specialty = specialty || null
    if (registrationNumber !== undefined) profileUpdateData.registrationNumber = registrationNumber || null
    if (bio !== undefined) profileUpdateData.bio = bio || null
    if (appointmentDuration !== undefined) profileUpdateData.appointmentDuration = appointmentDuration
    if (bufferBetweenSlots !== undefined) profileUpdateData.bufferBetweenSlots = bufferBetweenSlots
    if (allowOnlineBooking !== undefined) profileUpdateData.allowOnlineBooking = allowOnlineBooking
    if (maxAdvanceBookingDays !== undefined) profileUpdateData.maxAdvanceBookingDays = maxAdvanceBookingDays

    // Update in transaction
    const professional = await prisma.$transaction(async (tx) => {
      // Update user
      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: params.id },
          data: userUpdateData,
        })
      }

      // Update professional profile if it exists
      if (Object.keys(profileUpdateData).length > 0 && existing.professionalProfile) {
        await tx.professionalProfile.update({
          where: { id: existing.professionalProfile.id },
          data: profileUpdateData,
        })
      }

      return tx.user.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
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
    })

    return NextResponse.json({ professional })
  }
)

/**
 * DELETE /api/professionals/:id
 * Soft-delete (deactivate) a professional - ADMIN only
 */
export const DELETE = withFeatureAuth(
  { feature: "professionals", minAccess: "WRITE" },
  async (_req, { user }, params) => {
    // Verify the professional exists and belongs to the clinic
    const existing = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        professionalProfile: { isNot: null },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Professional not found" }, { status: 404 })
    }

    // Prevent self-deactivation
    if (existing.id === user.id) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account" },
        { status: 400 }
      )
    }

    // Soft delete by setting isActive to false
    await prisma.user.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  }
)
