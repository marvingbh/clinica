import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { parseFieldsSafe, hasUnpublishedChanges } from "@/lib/forms"

const createSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(120),
  description: z.string().trim().max(500).optional(),
})

/** GET /api/forms/templates — list the clinic's templates with summary counts. */
export const GET = withFeatureAuth(
  { feature: "forms", minAccess: "READ" },
  async (_req: NextRequest, { user }) => {
    const templates = await prisma.formTemplate.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, fields: true } },
        _count: { select: { versions: true } },
      },
    })

    const summaries = await Promise.all(
      templates.map(async (t) => {
        const latest = t.versions[0] ?? null
        const [total, concluidos] = await Promise.all([
          prisma.formResponse.count({ where: { clinicId: user.clinicId, formVersion: { templateId: t.id } } }),
          prisma.formResponse.count({
            where: { clinicId: user.clinicId, formVersion: { templateId: t.id }, status: "CONCLUIDO" },
          }),
        ])
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          isActive: t.isActive,
          autoSendOnIntakeApproval: t.autoSendOnIntakeApproval,
          latestVersion: latest?.version ?? null,
          versionCount: t._count.versions,
          hasUnpublishedChanges: hasUnpublishedChanges(
            parseFieldsSafe(t.draftFields),
            latest ? parseFieldsSafe(latest.fields) : null
          ),
          responseCounts: { total, concluidos },
        }
      })
    )

    return NextResponse.json({ templates: summaries })
  }
)

/** POST /api/forms/templates — create an empty draft template. */
export const POST = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const template = await prisma.formTemplate.create({
      data: {
        clinicId: user.clinicId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        draftFields: [],
        createdByUserId: user.id,
      },
    })

    await audit.log({
      user,
      action: AuditAction.FORM_TEMPLATE_CREATED,
      entityType: "FormTemplate",
      entityId: template.id,
      newValues: { name: template.name },
      request: req,
    })

    return NextResponse.json({ template }, { status: 201 })
  }
)
