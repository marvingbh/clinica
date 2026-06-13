import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { OwnershipError } from "@/lib/clinic/ownership"
import {
  isScaleCode,
  getScaleDefinition,
  validateAnswers,
  scoreScale,
  ScaleValidationError,
  IncompleteAnswersError,
} from "@/lib/scales"
import { runScaleRiskPipeline } from "@/lib/scales/risk-pipeline"
import { loadManageContext, ScaleAccessError } from "../helpers"

const schema = z.object({
  scaleCode: z.string().refine(isScaleCode, "Escala inválida"),
  answers: z.record(z.string(), z.number()),
})

/** POST /api/patients/[id]/escalas/em-sessao — fill + score a scale in session. */
export const POST = withFeatureAuth(
  { feature: "escalas", minAccess: "WRITE" },
  async (req: NextRequest, { user, access }, params) => {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { scaleCode, answers } = parsed.data

    try {
      const ctx = await loadManageContext(user, access, params.id)
      const def = getScaleDefinition(scaleCode)
      const clean = validateAnswers(def, answers)
      const score = scoreScale(def, clean)

      const now = new Date()
      const administration = await prisma.scaleAdministration.create({
        data: {
          clinicId: user.clinicId,
          patientId: ctx.patientId,
          professionalProfileId: ctx.professionalProfileId,
          scaleCode: def.code,
          scaleVersion: def.version,
          source: "EM_SESSAO",
          status: "CONCLUIDA",
          answers: clean,
          totalScore: score.totalScore,
          severityLabel: score.severityLabel,
          riskFlag: score.riskFlag,
          completedAt: now,
        },
        select: { id: true, totalScore: true, severityLabel: true, riskFlag: true },
      })

      await audit.log({
        user,
        action: AuditAction.SCALE_COMPLETED,
        entityType: "ScaleAdministration",
        entityId: administration.id,
        newValues: { scaleCode, source: "EM_SESSAO" },
        request: req,
      })

      if (score.riskFlag) {
        await runScaleRiskPipeline({
          clinicId: user.clinicId,
          administrationId: administration.id,
          patientId: ctx.patientId,
          professionalProfileId: ctx.professionalProfileId,
          scaleCode: def.code,
          patientName: ctx.patientName,
          completedAt: now,
        }).catch((err) => console.error("Scale risk pipeline failed:", err))
      }

      return NextResponse.json({ administration }, { status: 201 })
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
      }
      if (e instanceof ScaleAccessError) {
        return NextResponse.json({ error: e.message }, { status: 403 })
      }
      if (e instanceof ScaleValidationError || e instanceof IncompleteAnswersError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }
  }
)
