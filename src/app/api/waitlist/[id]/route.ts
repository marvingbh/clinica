import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { AuditAction, createAuditLog } from "@/lib/rbac/audit"
import { updateEntrySchema } from "@/lib/waitlist"
import { professionalBelongsToClinic } from "@/lib/clinic/ownership"
import type { Prisma } from "@prisma/client"

/** PATCH /api/waitlist/[id] — edit preferences/note/professional, or archive. */
export const PATCH = withFeatureAuth(
  { feature: "waitlist", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const entry = await prisma.waitlistEntry.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, status: true, professionalProfileId: true },
    })
    if (!entry) {
      return NextResponse.json({ error: "Entrada nao encontrada" }, { status: 404 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
    }
    const parsed = updateEntrySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados invalidos" },
        { status: 400 }
      )
    }
    const data = parsed.data

    if (
      data.professionalProfileId &&
      !(await professionalBelongsToClinic(data.professionalProfileId, user.clinicId))
    ) {
      return NextResponse.json({ error: "Profissional nao encontrado" }, { status: 404 })
    }

    const updateData: Prisma.WaitlistEntryUpdateInput = {}
    if (data.preferences !== undefined) updateData.preferences = data.preferences
    if (data.priorityNote !== undefined) updateData.priorityNote = data.priorityNote
    if (data.professionalProfileId !== undefined) {
      updateData.professionalProfile = data.professionalProfileId
        ? { connect: { id: data.professionalProfileId } }
        : { disconnect: true }
    }

    let action: string = AuditAction.WAITLIST_ENTRY_UPDATED
    if (data.status === "REMOVIDA") {
      if (!data.removedReason) {
        return NextResponse.json(
          { error: "Motivo da remoção é obrigatório" },
          { status: 400 }
        )
      }
      updateData.status = "REMOVIDA"
      updateData.removedReason = data.removedReason
      action = AuditAction.WAITLIST_ENTRY_REMOVED
    }

    const updated = await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: updateData,
      select: { id: true, status: true },
    })

    await createAuditLog({
      user,
      action,
      entityType: "WaitlistEntry",
      entityId: entry.id,
      oldValues: { status: entry.status },
      newValues: { status: updated.status, removedReason: data.removedReason },
    })

    return NextResponse.json({ entry: updated })
  }
)

/** DELETE /api/waitlist/[id] — hard delete (ADMIN only). */
export const DELETE = withFeatureAuth(
  { feature: "waitlist", minAccess: "WRITE" },
  async (_req, { user }, params) => {
    if (user.role !== "ADMIN") {
      return forbiddenResponse("Apenas administradores podem excluir entradas")
    }
    const entry = await prisma.waitlistEntry.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true },
    })
    if (!entry) {
      return NextResponse.json({ error: "Entrada nao encontrada" }, { status: 404 })
    }

    await prisma.waitlistEntry.delete({ where: { id: entry.id } })

    await createAuditLog({
      user,
      action: AuditAction.WAITLIST_ENTRY_REMOVED,
      entityType: "WaitlistEntry",
      entityId: entry.id,
      newValues: { hardDeleted: true },
    })

    return NextResponse.json({ success: true })
  }
)
