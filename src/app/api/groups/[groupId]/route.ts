import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(timeRegex, "Formato de horário inválido (HH:mm)").optional(),
  duration: z.number().int().min(15).max(480).optional(),
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  isActive: z.boolean().optional(),
  additionalProfessionalIds: z.array(z.string()).optional(),
  applyTo: z.enum(["future"]).optional(),
})

/**
 * GET /api/groups/[groupId]
 * Get a therapy group with its members
 */
export const GET = withFeatureAuth(
  { feature: "groups", minAccess: "READ" },
  async (req, { user }, params) => {
    const { groupId } = params

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    const group = await prisma.therapyGroup.findFirst({
      where,
      include: {
        professionalProfile: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        additionalProfessionals: {
          select: {
            professionalProfile: {
              select: { id: true, user: { select: { name: true } } },
            },
          },
        },
        memberships: {
          where: {
            leaveDate: null, // Only active members
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
          orderBy: {
            joinDate: "asc",
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 }
      )
    }

    return NextResponse.json({ group })
  }
)

/**
 * PATCH /api/groups/[groupId]
 * Update a therapy group
 */
export const PATCH = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { groupId } = params
    const body = await req.json()

    // Validate request body
    const validation = updateGroupSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    // Check if group exists
    const existingGroup = await prisma.therapyGroup.findFirst({
      where,
    })

    if (!existingGroup) {
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 }
      )
    }

    const { additionalProfessionalIds, applyTo, ...updateData } = validation.data

    const scheduleChanged = updateData.dayOfWeek !== undefined || updateData.startTime !== undefined ||
      updateData.duration !== undefined || updateData.recurrenceType !== undefined

    // Update the group with additional professionals in a transaction
    const { group, rescheduledCount } = await prisma.$transaction(async (tx) => {
      // Update group fields
      await tx.therapyGroup.update({
        where: { id: groupId },
        data: updateData,
      })

      // Update additional professionals if provided
      if (additionalProfessionalIds !== undefined) {
        const newIds = additionalProfessionalIds.filter(
          id => id !== existingGroup.professionalProfileId
        )

        let validIds: string[] = []
        if (newIds.length > 0) {
          const validProfs = await tx.professionalProfile.findMany({
            where: {
              id: { in: newIds },
              user: { clinicId: user.clinicId },
            },
            select: { id: true },
          })
          validIds = validProfs.map(p => p.id)
        }

        await tx.therapyGroupProfessional.deleteMany({ where: { groupId } })
        if (validIds.length > 0) {
          await tx.therapyGroupProfessional.createMany({
            data: validIds.map(profId => ({ groupId, professionalProfileId: profId })),
          })
        }
      }

      // Apply schedule changes to future sessions
      let rescheduled = 0
      if (applyTo === "future" && scheduleChanged) {
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        // Get the updated group for new values
        const updated = await tx.therapyGroup.findUniqueOrThrow({ where: { id: groupId } })
        const newDayOfWeek = updated.dayOfWeek
        const [newH, newM] = updated.startTime.split(":").map(Number)
        const newDuration = updated.duration

        // Get all future sessions
        const futureAppts = await tx.appointment.findMany({
          where: {
            groupId,
            scheduledAt: { gte: now },
            status: { in: ["AGENDADO", "CONFIRMADO"] },
          },
          select: { id: true, scheduledAt: true },
        })

        // Move each appointment to the new day/time
        for (const appt of futureAppts) {
          const oldDate = appt.scheduledAt
          const currentDay = oldDate.getDay()
          const dayDiff = newDayOfWeek - currentDay
          const newDate = new Date(oldDate)
          newDate.setDate(newDate.getDate() + dayDiff)
          newDate.setHours(newH, newM, 0, 0)
          const newEnd = new Date(newDate.getTime() + newDuration * 60000)

          await tx.appointment.update({
            where: { id: appt.id },
            data: { scheduledAt: newDate, endAt: newEnd },
          })
          rescheduled++
        }
      }

      const result = await tx.therapyGroup.findUniqueOrThrow({
        where: { id: groupId },
        include: {
          professionalProfile: {
            select: { id: true, user: { select: { name: true } } },
          },
          additionalProfessionals: {
            select: {
              professionalProfile: {
                select: { id: true, user: { select: { name: true } } },
              },
            },
          },
        },
      })

      return { group: result, rescheduledCount: rescheduled }
    }, { timeout: 30000 })

    const message = rescheduledCount > 0
      ? `Grupo atualizado. ${rescheduledCount} sessão(ões) futura(s) reagendada(s).`
      : "Grupo atualizado com sucesso"

    return NextResponse.json({ group, message, rescheduledCount })
  }
)

/**
 * DELETE /api/groups/[groupId]
 * Delete a therapy group
 */
export const DELETE = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { groupId } = params

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    // Check if group exists
    const existingGroup = await prisma.therapyGroup.findFirst({
      where,
    })

    if (!existingGroup) {
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 }
      )
    }

    // Delete the group (cascades to memberships, appointments keep groupId as null)
    await prisma.therapyGroup.delete({
      where: { id: groupId },
    })

    return NextResponse.json({ success: true })
  }
)
