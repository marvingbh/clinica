import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"

/**
 * GET /api/patients
 * List patients - ADMIN sees all clinic patients, PROFESSIONAL sees only patients they have appointments with
 */
export const GET = withAuth(
  { resource: "patient", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")
    const isActive = searchParams.get("isActive")

    // Base query always filters by clinic
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // For "own" scope, only show patients the professional has appointments with
    if (scope === "own" && user.professionalProfileId) {
      where.appointments = {
        some: {
          professionalProfileId: user.professionalProfileId,
        },
      }
    }

    // Apply optional filters
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ]
    }

    if (isActive !== null) {
      where.isActive = isActive === "true"
    }

    const patients = await prisma.patient.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birthDate: true,
        isActive: true,
        lastVisitAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ patients })
  }
)

/**
 * POST /api/patients
 * Create a new patient - only ADMIN can create patients
 */
export const POST = withAuth(
  { resource: "patient", action: "create" },
  async (req, { user }) => {
    const body = await req.json()
    const { name, email, phone, birthDate, cpf, notes } = body

    // Check for duplicate phone within clinic
    const existingPhone = await prisma.patient.findUnique({
      where: {
        clinicId_phone: {
          clinicId: user.clinicId,
          phone,
        },
      },
    })

    if (existingPhone) {
      return NextResponse.json(
        { error: "A patient with this phone number already exists" },
        { status: 409 }
      )
    }

    // Check for duplicate CPF if provided
    if (cpf) {
      const existingCpf = await prisma.patient.findUnique({
        where: {
          clinicId_cpf: {
            clinicId: user.clinicId,
            cpf,
          },
        },
      })

      if (existingCpf) {
        return NextResponse.json(
          { error: "A patient with this CPF already exists" },
          { status: 409 }
        )
      }
    }

    const patient = await prisma.patient.create({
      data: {
        clinicId: user.clinicId,
        name,
        email: email || null,
        phone,
        birthDate: birthDate ? new Date(birthDate) : null,
        cpf: cpf || null,
        notes: notes || null,
      },
    })

    return NextResponse.json({ patient }, { status: 201 })
  }
)
