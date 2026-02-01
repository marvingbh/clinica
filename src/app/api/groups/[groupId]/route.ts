import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(timeRegex, "Formato de horário inválido (HH:mm)").optional(),
  duration: z.number().int().min(15).max(480).optional(),
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  isActive: z.boolean().optional(),
})

/**
 * GET /api/groups/[groupId]
 * Get a therapy group with its members
 */
export const GET = withAuth(
  { resource: "therapy-group", action: "read" },
  async (req, { user, scope }, params) => {
    const { groupId } = params

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    // If scope is "own", only allow access to own groups
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
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
export const PATCH = withAuth(
  { resource: "therapy-group", action: "update" },
  async (req, { user, scope }, params) => {
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

    // If scope is "own", only allow access to own groups
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
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

    // Update the group
    const group = await prisma.therapyGroup.update({
      where: { id: groupId },
      data: validation.data,
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
      },
    })

    return NextResponse.json({ group })
  }
)

/**
 * DELETE /api/groups/[groupId]
 * Delete a therapy group
 */
export const DELETE = withAuth(
  { resource: "therapy-group", action: "delete" },
  async (req, { user, scope }, params) => {
    const { groupId } = params

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    // If scope is "own", only allow access to own groups
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
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
