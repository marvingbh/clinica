import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { OwnershipError } from "@/lib/clinic/ownership"
import { getScaleDefinition, isScaleCode, SOURCE_LABELS } from "@/lib/scales"
import { createTrajectoryDocument } from "@/lib/scales/pdf"
import { assertCanViewPatientScales, ScaleAccessError } from "../helpers"

/** GET /api/patients/[id]/escalas/pdf?scaleCode= — trajectory PDF export. */
export const GET = withFeatureAuth(
  { feature: "escalas", minAccess: "READ" },
  async (req: NextRequest, { user, access }, params) => {
    const scaleCode = new URL(req.url).searchParams.get("scaleCode") ?? ""
    if (!isScaleCode(scaleCode)) {
      return NextResponse.json({ error: "Escala inválida" }, { status: 400 })
    }

    try {
      await assertCanViewPatientScales(user, access, params.id)

      const [patient, clinic, rows] = await Promise.all([
        prisma.patient.findFirst({
          where: { id: params.id, clinicId: user.clinicId },
          select: { name: true },
        }),
        prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { name: true } }),
        prisma.scaleAdministration.findMany({
          where: {
            clinicId: user.clinicId,
            patientId: params.id,
            scaleCode,
            status: "CONCLUIDA",
          },
          orderBy: { completedAt: "asc" },
          select: { completedAt: true, totalScore: true, severityLabel: true, source: true },
        }),
      ])
      if (!patient) throw new OwnershipError()

      const def = getScaleDefinition(scaleCode)
      const buffer = await renderToBuffer(
        createTrajectoryDocument({
          clinicName: clinic?.name ?? "",
          patientName: patient.name,
          scaleName: def.shortName,
          maxScore: def.maxScore,
          rows: rows.map((r) => ({
            dateLabel: r.completedAt ? r.completedAt.toLocaleDateString("pt-BR") : "",
            totalScore: r.totalScore ?? 0,
            severityLabel: r.severityLabel ?? "",
            sourceLabel: SOURCE_LABELS[r.source] ?? r.source,
          })),
        })
      )

      await audit.log({
        user,
        action: AuditAction.SCALE_PDF_EXPORTED,
        entityType: "Patient",
        entityId: params.id,
        newValues: { scaleCode },
        request: req,
      })

      const safeName = patient.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="escala-${scaleCode}-${safeName}.pdf"`,
        },
      })
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
      }
      if (e instanceof ScaleAccessError) {
        return NextResponse.json({ error: e.message }, { status: 403 })
      }
      throw e
    }
  }
)
