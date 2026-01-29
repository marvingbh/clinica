import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"

/**
 * GET /api/patients/:id
 * Get a specific patient - ADMIN can view any, PROFESSIONAL only patients they have appointments with
 */
export const GET = withAuth(
  { resource: "patient", action: "read" },
  async (_req, { user, scope }, params) => {
    const patient = await prisma.patient.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
      include: {
        appointments: {
          where:
            scope === "own" && user.professionalProfileId
              ? { professionalProfileId: user.professionalProfileId }
              : undefined,
          orderBy: { scheduledAt: "desc" },
          take: 10,
          include: {
            professionalProfile: {
              include: {
                user: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    })

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    }

    // For "own" scope, verify the professional has appointments with this patient
    if (scope === "own" && user.professionalProfileId) {
      const hasAppointment = await prisma.appointment.findFirst({
        where: {
          patientId: params.id,
          professionalProfileId: user.professionalProfileId,
        },
      })

      if (!hasAppointment) {
        return forbiddenResponse("You can only view patients you have appointments with")
      }
    }

    return NextResponse.json({ patient })
  }
)

/**
 * PATCH /api/patients/:id
 * Update a patient - only ADMIN can update patients
 */
export const PATCH = withAuth(
  { resource: "patient", action: "update" },
  async (req, { user }, params) => {
    // Verify the patient exists and belongs to the clinic
    const existing = await prisma.patient.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    }

    const body = await req.json()
    const { name, email, phone, birthDate, cpf, notes, isActive } = body

    const updateData: Record<string, unknown> = {}

    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email || null
    if (phone !== undefined) updateData.phone = phone
    if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null
    if (cpf !== undefined) updateData.cpf = cpf || null
    if (notes !== undefined) updateData.notes = notes || null
    if (isActive !== undefined) updateData.isActive = isActive

    // Check for duplicate phone if changing
    if (phone && phone !== existing.phone) {
      const existingPhone = await prisma.patient.findFirst({
        where: {
          clinicId: user.clinicId,
          phone,
          NOT: { id: params.id },
        },
      })

      if (existingPhone) {
        return NextResponse.json(
          { error: "A patient with this phone number already exists" },
          { status: 409 }
        )
      }
    }

    // Check for duplicate CPF if changing
    if (cpf && cpf !== existing.cpf) {
      const existingCpf = await prisma.patient.findFirst({
        where: {
          clinicId: user.clinicId,
          cpf,
          NOT: { id: params.id },
        },
      })

      if (existingCpf) {
        return NextResponse.json(
          { error: "A patient with this CPF already exists" },
          { status: 409 }
        )
      }
    }

    const patient = await prisma.patient.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json({ patient })
  }
)

/**
 * DELETE /api/patients/:id
 * Delete a patient - only ADMIN can delete patients
 */
export const DELETE = withAuth(
  { resource: "patient", action: "delete" },
  async (_req, { user }, params) => {
    // Verify the patient exists and belongs to the clinic
    const existing = await prisma.patient.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    }

    await prisma.patient.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  }
)
