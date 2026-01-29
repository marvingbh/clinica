import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { z } from "zod"

const timeBlockSchema = z.object({
  id: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  isActive: z.boolean().default(true),
})

const updateAvailabilitySchema = z.object({
  professionalProfileId: z.string().optional(),
  rules: z.array(timeBlockSchema),
})

/**
 * GET /api/availability
 * Returns the current user's availability rules (or specific professional's if ADMIN)
 */
export const GET = withAuth(
  { resource: "availability-rule", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const professionalProfileId = searchParams.get("professionalProfileId")

    // Determine which professional's availability to return
    let targetProfileId: string | null = null

    if (professionalProfileId && scope === "clinic") {
      // ADMIN can view any professional's availability
      // Verify the professional belongs to the same clinic
      const profile = await prisma.professionalProfile.findFirst({
        where: {
          id: professionalProfileId,
          user: { clinicId: user.clinicId },
        },
      })

      if (!profile) {
        return NextResponse.json(
          { error: "Professional not found" },
          { status: 404 }
        )
      }

      targetProfileId = professionalProfileId
    } else if (user.professionalProfileId) {
      // PROFESSIONAL can only view their own availability
      targetProfileId = user.professionalProfileId
    } else {
      // ADMIN without specifying a professional - return empty
      return NextResponse.json({ rules: [] })
    }

    const rules = await prisma.availabilityRule.findMany({
      where: { professionalProfileId: targetProfileId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isActive: true,
      },
    })

    return NextResponse.json({ rules })
  }
)

/**
 * POST /api/availability
 * Creates or updates availability rules (replaces all rules for a day)
 */
export const POST = withAuth(
  { resource: "availability-rule", action: "update" },
  async (req, { user, scope }) => {
    const body = await req.json()

    const validation = updateAvailabilitySchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { professionalProfileId, rules } = validation.data

    // Determine target professional profile
    let targetProfileId: string | null = null

    if (professionalProfileId && scope === "clinic") {
      // ADMIN can update any professional's availability
      const profile = await prisma.professionalProfile.findFirst({
        where: {
          id: professionalProfileId,
          user: { clinicId: user.clinicId },
        },
      })

      if (!profile) {
        return NextResponse.json(
          { error: "Professional not found" },
          { status: 404 }
        )
      }

      targetProfileId = professionalProfileId
    } else if (user.professionalProfileId) {
      // PROFESSIONAL can only update their own availability
      targetProfileId = user.professionalProfileId
    } else {
      return forbiddenResponse("Cannot update availability without a professional profile")
    }

    // Validate that endTime > startTime for all rules
    for (const rule of rules) {
      if (rule.startTime >= rule.endTime) {
        return NextResponse.json(
          { error: `Invalid time range: ${rule.startTime} must be before ${rule.endTime}` },
          { status: 400 }
        )
      }
    }

    // Replace all availability rules for this professional
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing rules
      await tx.availabilityRule.deleteMany({
        where: { professionalProfileId: targetProfileId! },
      })

      // Create new rules
      if (rules.length > 0) {
        await tx.availabilityRule.createMany({
          data: rules.map((rule) => ({
            professionalProfileId: targetProfileId!,
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            isActive: rule.isActive,
          })),
        })
      }

      // Return updated rules
      return tx.availabilityRule.findMany({
        where: { professionalProfileId: targetProfileId! },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          isActive: true,
        },
      })
    })

    return NextResponse.json({ rules: result })
  }
)
