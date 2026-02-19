import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { hashPassword } from "@/lib/password"
import { Role } from "@prisma/client"

/**
 * GET /api/professionals
 * List professionals - ADMIN only
 */
export const GET = withFeatureAuth(
  { feature: "professionals", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")
    const isActive = searchParams.get("isActive")

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      professionalProfile: { isNot: null },
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        {
          professionalProfile: {
            specialty: { contains: search, mode: "insensitive" },
          },
        },
      ]
    }

    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === "true"
    }

    const professionals = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
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
            appointmentDuration: true,
            bufferBetweenSlots: true,
          },
        },
      },
    })

    return NextResponse.json({ professionals })
  }
)

/**
 * POST /api/professionals
 * Create a new professional (User + ProfessionalProfile) - ADMIN only
 */
export const POST = withFeatureAuth(
  { feature: "professionals", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const { name, email, password, specialty, registrationNumber, appointmentDuration, bufferBetweenSlots } = body

    // Validate required fields
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      )
    }

    // Check for duplicate email within clinic
    const existingEmail = await prisma.user.findUnique({
      where: {
        clinicId_email: {
          clinicId: user.clinicId,
          email,
        },
      },
    })

    if (existingEmail) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user and professional profile in a transaction
    const professional = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          clinicId: user.clinicId,
          name,
          email,
          passwordHash,
          role: Role.PROFESSIONAL,
        },
      })

      await tx.professionalProfile.create({
        data: {
          userId: newUser.id,
          specialty: specialty || null,
          registrationNumber: registrationNumber || null,
          appointmentDuration: appointmentDuration ?? 50,
          bufferBetweenSlots: bufferBetweenSlots ?? 0,
        },
      })

      // Update clinic timezone if provided (stored in clinic settings)
      // Note: timezone is a clinic-level setting, not per-professional

      return tx.user.findUnique({
        where: { id: newUser.id },
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
              appointmentDuration: true,
              bufferBetweenSlots: true,
            },
          },
        },
      })
    })

    return NextResponse.json({ professional }, { status: 201 })
  }
)
