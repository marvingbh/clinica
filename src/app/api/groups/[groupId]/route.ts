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

    const { additionalProfessionalIds, ...updateData } = validation.data

    // Update the group with additional professionals in a transaction
    const group = await prisma.$transaction(async (tx) => {
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

        // Validate additional professionals belong to clinic
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

        // Delete existing + recreate
        await tx.therapyGroupProfessional.deleteMany({
          where: { groupId },
        })
        if (validIds.length > 0) {
          await tx.therapyGroupProfessional.createMany({
            data: validIds.map(profId => ({
              groupId,
              professionalProfileId: profId,
            })),
          })
        }
      }

      return tx.therapyGroup.findUniqueOrThrow({
        where: { id: groupId },
        include: {
          professionalProfile: {
            select: {
              id: true,
              user: { select: { name: true } },
            },
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
    })

    return NextResponse.json({ group })
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
