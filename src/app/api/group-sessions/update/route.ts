import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"

const updateSchema = z.object({
  // Identify the session: either by sessionGroupId or groupId + scheduledAt
  sessionGroupId: z.string().optional(),
  groupId: z.string().optional(),
  scheduledAt: z.string().min(1),
  // Fields to update
  title: z.string().min(1).max(200).optional(),
  newScheduledAt: z.string().optional(),
  newEndAt: z.string().optional(),
})

/**
 * PATCH /api/group-sessions/update
 * Update title and/or reschedule all appointments in a group session.
 * Works for both one-off (sessionGroupId) and recurring (groupId) sessions.
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const { sessionGroupId, groupId, scheduledAt, title, newScheduledAt, newEndAt } = parsed.data

    if (!sessionGroupId && !groupId) {
      return NextResponse.json({ error: "sessionGroupId ou groupId é obrigatório" }, { status: 400 })
    }

    const scheduledDate = new Date(scheduledAt)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)

    // Build where clause
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
    }
    if (sessionGroupId) where.sessionGroupId = sessionGroupId
    else if (groupId) where.groupId = groupId

    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = title
    if (newScheduledAt) data.scheduledAt = new Date(newScheduledAt)
    if (newEndAt) data.endAt = new Date(newEndAt)

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 })
    }

    const result = await prisma.appointment.updateMany({ where, data })

    return NextResponse.json({ success: true, updatedCount: result.count })
  }
)

/**
 * DELETE /api/group-sessions/update
 * Delete all appointments in a group session for a specific date.
 */
export const DELETE = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const sessionGroupId = searchParams.get("sessionGroupId")
    const groupId = searchParams.get("groupId")
    const scheduledAt = searchParams.get("scheduledAt")

    if ((!sessionGroupId && !groupId) || !scheduledAt) {
      return NextResponse.json({ error: "sessionGroupId/groupId e scheduledAt são obrigatórios" }, { status: 400 })
    }

    const scheduledDate = new Date(scheduledAt)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
    }
    if (sessionGroupId) where.sessionGroupId = sessionGroupId
    else if (groupId) where.groupId = groupId

    const result = await prisma.appointment.deleteMany({ where })

    return NextResponse.json({ success: true, deletedCount: result.count })
  }
)
