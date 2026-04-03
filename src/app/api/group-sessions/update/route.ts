import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"

const updateSchema = z.object({
  sessionGroupId: z.string().min(1),
  scheduledAt: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
})

/**
 * PATCH /api/group-sessions/update
 * Update title for all appointments in a session group.
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const { sessionGroupId, scheduledAt, title } = parsed.data
    const scheduledDate = new Date(scheduledAt)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)

    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = title

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 })
    }

    const result = await prisma.appointment.updateMany({
      where: {
        clinicId: user.clinicId,
        sessionGroupId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      data,
    })

    return NextResponse.json({ success: true, updatedCount: result.count })
  }
)

/**
 * DELETE /api/group-sessions/update
 * Delete all appointments in a session group for a specific date.
 */
export const DELETE = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const sessionGroupId = searchParams.get("sessionGroupId")
    const scheduledAt = searchParams.get("scheduledAt")

    if (!sessionGroupId || !scheduledAt) {
      return NextResponse.json({ error: "sessionGroupId e scheduledAt são obrigatórios" }, { status: 400 })
    }

    const scheduledDate = new Date(scheduledAt)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)

    const result = await prisma.appointment.deleteMany({
      where: {
        clinicId: user.clinicId,
        sessionGroupId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
    })

    return NextResponse.json({ success: true, deletedCount: result.count })
  }
)
