import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { parseFieldsSafe, canPublish, nextVersion } from "@/lib/forms"

/**
 * POST /api/forms/templates/[id]/publish — snapshots the current draft into a
 * new immutable FormVersion.
 */
export const POST = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const template = await prisma.formTemplate.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: { versions: { select: { version: true } } },
    })
    if (!template) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 })

    const fields = parseFieldsSafe(template.draftFields)
    const check = canPublish(fields)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

    const version = await prisma.formVersion.create({
      data: {
        clinicId: user.clinicId,
        templateId: template.id,
        version: nextVersion(template.versions),
        fields: fields as unknown as Prisma.InputJsonValue,
      },
    })

    await audit.log({
      user,
      action: AuditAction.FORM_TEMPLATE_PUBLISHED,
      entityType: "FormTemplate",
      entityId: template.id,
      newValues: { version: version.version },
      request: req,
    })

    return NextResponse.json({ version: { id: version.id, version: version.version, publishedAt: version.publishedAt } }, { status: 201 })
  }
)
