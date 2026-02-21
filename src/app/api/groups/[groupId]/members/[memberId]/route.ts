import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"

const updateMemberSchema = z.object({
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)").nullable(),
})

/**
 * PATCH /api/groups/[groupId]/members/[memberId]
 * Update a member (set leaveDate to remove from group)
 */
export const PATCH = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { groupId, memberId } = params
    const body = await req.json()

    // Validate request body
    const validation = updateMemberSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { leaveDate } = validation.data

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

    // Check if membership exists
    const existingMembership = await prisma.groupMembership.findFirst({
      where: {
        id: memberId,
        groupId,
        clinicId: user.clinicId,
      },
    })

    if (!existingMembership) {
      return NextResponse.json(
        { error: "Membro não encontrado" },
        { status: 404 }
      )
    }

    // If setting leaveDate, cancel all future appointments for this patient in this group
    let cancelledAppointmentsCount = 0
    if (leaveDate) {
      const leaveDateObj = new Date(leaveDate + "T00:00:00")

      // Cancel all future group appointments for this patient
      const cancelResult = await prisma.appointment.updateMany({
        where: {
          groupId,
          patientId: existingMembership.patientId,
          scheduledAt: { gte: leaveDateObj },
          status: { notIn: ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL", "FINALIZADO"] },
        },
        data: {
          status: "CANCELADO_PROFISSIONAL",
          cancellationReason: "Paciente removido do grupo",
          cancelledAt: new Date(),
        },
      })
      cancelledAppointmentsCount = cancelResult.count
    }

    // Update the membership
    const membership = await prisma.groupMembership.update({
      where: { id: memberId },
      data: {
        leaveDate: leaveDate ? new Date(leaveDate) : null,
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

    return NextResponse.json({
      membership,
      cancelledAppointmentsCount,
      ...(cancelledAppointmentsCount > 0 && {
        message: `${cancelledAppointmentsCount} sessão(ões) futura(s) cancelada(s) automaticamente.`,
      }),
    })
  }
)
