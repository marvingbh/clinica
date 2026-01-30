import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const createGroupSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  professionalProfileId: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRegex, "Formato de horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).default(90),
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).default("WEEKLY"),
})

/**
 * GET /api/groups
 * List therapy groups - ADMIN sees all clinic groups, PROFESSIONAL sees only their own
 */
export const GET = withAuth(
  { resource: "therapy-group", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const isActive = searchParams.get("isActive")
    const professionalProfileId = searchParams.get("professionalProfileId")

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // If scope is "own", filter to only the professional's groups
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (professionalProfileId && scope === "clinic") {
      // ADMIN can filter by specific professional
      where.professionalProfileId = professionalProfileId
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
export const POST = withAuth(
  { resource: "therapy-group", action: "create" },
  async (req, { user, scope }) => {
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

    // If scope is "own", professional can only create groups for themselves
    if (scope === "own" && targetProfessionalProfileId !== user.professionalProfileId) {
      return NextResponse.json(
        { error: "Você só pode criar grupos para si mesmo" },
        { status: 403 }
      )
    }

    // Create the group
    const group = await prisma.therapyGroup.create({
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

    return NextResponse.json({ group }, { status: 201 })
  }
)
