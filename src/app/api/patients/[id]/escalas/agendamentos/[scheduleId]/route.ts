import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertScaleScheduleInClinic, OwnershipError } from "@/lib/clinic/ownership"
import { loadManageContext, ScaleAccessError } from "../../helpers"

const patchSchema = z
  .object({
    active: z.boolean().optional(),
    cadenceType: z.enum(["ANTES_DE_SESSAO", "A_CADA_N_SEMANAS"]).optional(),
    intervalWeeks: z.number().int().min(1).max(26).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nenhum campo para atualizar." })

/** PATCH — update a schedule (reactivating clears the paused reason). */
export const PATCH = withFeatureAuth(
  { feature: "escalas", minAccess: "WRITE" },
  async (req: NextRequest, { user, access }, params) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    try {
      await loadManageContext(user, access, params.id)
      const schedule = await assertScaleScheduleInClinic(user.clinicId, params.scheduleId)
      if (schedule.patientId !== params.id) throw new OwnershipError()

      const data: Prisma.ScaleScheduleUpdateInput = {}
      if (parsed.data.cadenceType !== undefined) data.cadenceType = parsed.data.cadenceType
      if (parsed.data.intervalWeeks !== undefined) data.intervalWeeks = parsed.data.intervalWeeks
      if (parsed.data.active !== undefined) {
        data.active = parsed.data.active
        if (parsed.data.active) data.pausedReason = null
      }

      const updated = await prisma.scaleSchedule.update({
        where: { id: params.scheduleId },
        data,
      })

      await audit.log({
        user,
        action: AuditAction.SCALE_SCHEDULE_UPDATED,
        entityType: "ScaleSchedule",
        entityId: updated.id,
        newValues: parsed.data,
        request: req,
      })

      return NextResponse.json({ schedule: updated })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json(
          { error: "Já existe um envio automático ativo desta escala." },
          { status: 409 }
        )
      }
      return mapError(e)
    }
  }
)

/** DELETE — remove a schedule. */
export const DELETE = withFeatureAuth(
  { feature: "escalas", minAccess: "WRITE" },
  async (req: NextRequest, { user, access }, params) => {
    try {
      await loadManageContext(user, access, params.id)
      const schedule = await assertScaleScheduleInClinic(user.clinicId, params.scheduleId)
      if (schedule.patientId !== params.id) throw new OwnershipError()

      await prisma.scaleSchedule.delete({ where: { id: params.scheduleId } })

      await audit.log({
        user,
        action: AuditAction.SCALE_SCHEDULE_DELETED,
        entityType: "ScaleSchedule",
        entityId: params.scheduleId,
        request: req,
      })

      return NextResponse.json({ ok: true })
    } catch (e) {
      return mapError(e)
    }
  }
)

function mapError(e: unknown): NextResponse {
  if (e instanceof OwnershipError) {
    return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
  }
  if (e instanceof ScaleAccessError) {
    return NextResponse.json({ error: e.message }, { status: 403 })
  }
  throw e
}
