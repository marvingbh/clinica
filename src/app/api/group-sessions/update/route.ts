import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { findAppointmentsLinkedToInvoices, buildInvoiceLinkError } from "@/lib/appointments/invoice-link-guard"
import { enqueueCalendarSync, flushCalendarSyncAfterResponse } from "@/lib/calendar-sync"
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

    const affected = await prisma.appointment.findMany({ where, select: { id: true } })
    const result = await prisma.appointment.updateMany({ where, data })

    // Mirror the edited group-session appointments to external calendars.
    if (affected.length > 0) {
      await enqueueCalendarSync(prisma, {
        clinicId: user.clinicId,
        appointmentIds: affected.map((a) => a.id),
        operation: "UPSERT",
      }).catch(() => {})
      flushCalendarSyncAfterResponse()
    }

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

    // Pre-check: refuse to delete any session whose appointment is invoiced.
    const toDelete = await prisma.appointment.findMany({ where, select: { id: true } })
    const blocks = await findAppointmentsLinkedToInvoices(
      prisma,
      toDelete.map((a) => a.id),
    )
    if (blocks.length > 0) {
      return NextResponse.json(buildInvoiceLinkError(blocks), { status: 409 })
    }

    // Enqueue the remote DELETE before the physical delete (same transaction)
    // so the event links survive for the processor's remote cleanup.
    const apptIds = toDelete.map((a) => a.id)
    const result = await prisma.$transaction(async (tx) => {
      if (apptIds.length > 0) {
        await enqueueCalendarSync(tx, {
          clinicId: user.clinicId,
          appointmentIds: apptIds,
          operation: "DELETE",
        })
      }
      return tx.appointment.deleteMany({ where })
    })
    if (apptIds.length > 0) flushCalendarSyncAfterResponse()

    return NextResponse.json({ success: true, deletedCount: result.count })
  }
)
