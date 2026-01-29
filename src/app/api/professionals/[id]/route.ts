import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { hashPassword } from "@/lib/password"
import { Role } from "@/generated/prisma/client"

/**
 * GET /api/professionals/:id
 * Get a specific professional - ADMIN only
 */
export const GET = withAuth(
  { resource: "user", action: "read" },
  async (_req, { user, scope }, params) => {
    // Only ADMIN can access (clinic scope required)
    if (scope !== "clinic") {
      return forbiddenResponse("Only administrators can view professional details")
    }

    const professional = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        role: Role.PROFESSIONAL,
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
export const PATCH = withAuth(
  { resource: "user", action: "update" },
  async (req, { user, scope }, params) => {
    // Only ADMIN can update (clinic scope required)
    if (scope !== "clinic") {
      return forbiddenResponse("Only administrators can update professionals")
    }

    // Verify the professional exists and belongs to the clinic
    const existing = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        role: Role.PROFESSIONAL,
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
export const DELETE = withAuth(
  { resource: "user", action: "delete" },
  async (_req, { user, scope }, params) => {
    // Only ADMIN can delete (clinic scope required)
    if (scope !== "clinic") {
      return forbiddenResponse("Only administrators can deactivate professionals")
    }

    // Verify the professional exists and belongs to the clinic
    const existing = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        role: Role.PROFESSIONAL,
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
