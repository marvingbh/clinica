import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"

const addMemberSchema = z.object({
  patientId: z.string().min(1, "ID do paciente é obrigatório"),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
})

/**
 * POST /api/groups/[groupId]/members
 * Add a patient as a member of the group
 */
export const POST = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { groupId } = params
    const body = await req.json()

    // Validate request body
    const validation = addMemberSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { patientId, joinDate } = validation.data

    // Build where clause for group access
    const groupWhere: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    // Check if group exists and user has access
    const group = await prisma.therapyGroup.findFirst({
      where: groupWhere,
    })

    if (!group) {
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 }
      )
    }

    // Verify patient exists in the same clinic
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId: user.clinicId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    })

    if (!patient) {
      return NextResponse.json(
        { error: "Paciente não encontrado ou inativo" },
        { status: 404 }
      )
    }

    // Check if patient is already an active member
    const existingMembership = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        patientId,
        leaveDate: null,
      },
    })

    if (existingMembership) {
      return NextResponse.json(
        { error: "Paciente já é membro ativo deste grupo" },
        { status: 409 }
      )
    }

    // Create the membership
    const membership = await prisma.groupMembership.create({
      data: {
        clinicId: user.clinicId,
        groupId,
        patientId,
        joinDate: new Date(joinDate),
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ membership }, { status: 201 })
  }
)
