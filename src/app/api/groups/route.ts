import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const createGroupSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  professionalProfileId: z.string().optional(),
  additionalProfessionalIds: z.array(z.string()).optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRegex, "Formato de horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).default(90),
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).default("WEEKLY"),
})

/**
 * GET /api/groups
 * List therapy groups - ADMIN sees all clinic groups, PROFESSIONAL sees only their own
 */
export const GET = withFeatureAuth(
  { feature: "groups", minAccess: "READ" },
  async (req, { user, access }) => {
    const { searchParams } = new URL(req.url)
    const isActive = searchParams.get("isActive")
    const professionalProfileId = searchParams.get("professionalProfileId")

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // Filter by specific professional if requested
    if (professionalProfileId) {
      where.OR = [
        { professionalProfileId },
        { additionalProfessionals: { some: { professionalProfileId } } },
      ]
    }

    // Apply optional filter
    if (isActive !== null) {
      where.isActive = isActive === "true"
    }

    const groups = await prisma.therapyGroup.findMany({
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
        _count: {
          select: {
            memberships: {
              where: {
                leaveDate: null,
              },
            },
          },
        },
      },
      orderBy: [
        { dayOfWeek: "asc" },
        { startTime: "asc" },
      ],
    })

    // Transform response to include activeMemberCount
    const transformedGroups = groups.map(group => ({
      ...group,
      activeMemberCount: group._count.memberships,
      _count: undefined,
    }))

    return NextResponse.json({ groups: transformedGroups })
  }
)

/**
 * POST /api/groups
 * Create a new therapy group
 */
export const POST = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user, access }) => {
    const body = await req.json()

    // Validate request body
    const validation = createGroupSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, dayOfWeek, startTime, duration, recurrenceType } = validation.data

    // Determine professionalProfileId
    let targetProfessionalProfileId = validation.data.professionalProfileId

    // If professional doesn't specify professionalProfileId, use their own
    if (!targetProfessionalProfileId && user.professionalProfileId) {
      targetProfessionalProfileId = user.professionalProfileId
    }

    if (!targetProfessionalProfileId) {
      return NextResponse.json(
        { error: "professionalProfileId é obrigatório" },
        { status: 400 }
      )
    }

    // Validate that the professional belongs to the same clinic
    const professional = await prisma.professionalProfile.findFirst({
      where: {
        id: targetProfessionalProfileId,
        user: {
          clinicId: user.clinicId,
        },
      },
      select: {
        id: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    })

    if (!professional) {
      return NextResponse.json(
        { error: "Profissional não encontrado na sua clínica" },
        { status: 404 }
      )
    }

    // Process additional professionals
    let additionalProfessionalIds: string[] = []
    if (validation.data.additionalProfessionalIds?.length) {
      additionalProfessionalIds = validation.data.additionalProfessionalIds.filter(
        id => id !== targetProfessionalProfileId
      )
      if (additionalProfessionalIds.length > 0) {
        const validProfs = await prisma.professionalProfile.findMany({
          where: {
            id: { in: additionalProfessionalIds },
            user: { clinicId: user.clinicId },
          },
          select: { id: true },
        })
        const validIds = new Set(validProfs.map(p => p.id))
        additionalProfessionalIds = additionalProfessionalIds.filter(id => validIds.has(id))
      }
    }

    // Create the group with additional professionals
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.therapyGroup.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: targetProfessionalProfileId,
          name,
          dayOfWeek,
          startTime,
          duration,
          recurrenceType,
        },
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

      if (additionalProfessionalIds.length > 0) {
        await tx.therapyGroupProfessional.createMany({
          data: additionalProfessionalIds.map(profId => ({
            groupId: created.id,
            professionalProfileId: profId,
          })),
        })
      }

      // Re-fetch to include additional professionals
      return tx.therapyGroup.findUniqueOrThrow({
        where: { id: created.id },
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

    return NextResponse.json({ group }, { status: 201 })
  }
)
