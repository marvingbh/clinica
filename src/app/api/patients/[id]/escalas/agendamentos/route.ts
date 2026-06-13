import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { OwnershipError } from "@/lib/clinic/ownership"
import { isScaleCode } from "@/lib/scales"
import { assertCanViewPatientScales, loadManageContext, ScaleAccessError } from "../helpers"

const createSchema = z
  .object({
    scaleCode: z.string().refine(isScaleCode, "Escala inválida"),
    cadenceType: z.enum(["ANTES_DE_SESSAO", "A_CADA_N_SEMANAS"]),
    intervalWeeks: z.number().int().min(1).max(26).optional(),
  })
  .refine((d) => d.cadenceType !== "A_CADA_N_SEMANAS" || d.intervalWeeks != null, {
    message: "Informe o intervalo em semanas (1 a 26).",
    path: ["intervalWeeks"],
  })

/** GET — list automatic-send schedules for a patient. */
export const GET = withFeatureAuth(
  { feature: "escalas", minAccess: "READ" },
  async (req: NextRequest, { user, access }, params) => {
    try {
      await assertCanViewPatientScales(user, access, params.id)
      const schedules = await prisma.scaleSchedule.findMany({
        where: { clinicId: user.clinicId, patientId: params.id },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json({ schedules })
    } catch (e) {
      return mapError(e)
    }
  }
)

/** POST — create an automatic-send schedule. */
export const POST = withFeatureAuth(
  { feature: "escalas", minAccess: "WRITE" },
  async (req: NextRequest, { user, access }, params) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { scaleCode, cadenceType, intervalWeeks } = parsed.data

    try {
      const ctx = await loadManageContext(user, access, params.id)
      const schedule = await prisma.scaleSchedule.create({
        data: {
          clinicId: user.clinicId,
          patientId: ctx.patientId,
          professionalProfileId: ctx.professionalProfileId,
          scaleCode,
          cadenceType,
          intervalWeeks: cadenceType === "A_CADA_N_SEMANAS" ? intervalWeeks : null,
        },
      })

      await audit.log({
        user,
        action: AuditAction.SCALE_SCHEDULE_CREATED,
        entityType: "ScaleSchedule",
        entityId: schedule.id,
        newValues: { scaleCode, cadenceType, intervalWeeks },
        request: req,
      })

      return NextResponse.json({ schedule }, { status: 201 })
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

function mapError(e: unknown): NextResponse {
  if (e instanceof OwnershipError) {
    return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
  }
  if (e instanceof ScaleAccessError) {
    return NextResponse.json({ error: e.message }, { status: 403 })
  }
  throw e
}
