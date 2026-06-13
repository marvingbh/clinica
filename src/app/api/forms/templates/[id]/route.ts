import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { validateFields, parseFieldsSafe } from "@/lib/forms"

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  draftFields: z.array(z.unknown()).optional(),
  autoSendOnIntakeApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

/** GET /api/forms/templates/[id] — template + draft + published version list. */
export const GET = withFeatureAuth(
  { feature: "forms", minAccess: "READ" },
  async (_req: NextRequest, { user }, params) => {
    const template = await prisma.formTemplate.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        versions: { orderBy: { version: "desc" }, select: { id: true, version: true, publishedAt: true } },
      },
    })
    if (!template) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 })

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        isActive: template.isActive,
        autoSendOnIntakeApproval: template.autoSendOnIntakeApproval,
      },
      draftFields: parseFieldsSafe(template.draftFields),
      versions: template.versions,
    })
  }
)

/** PATCH /api/forms/templates/[id] — update metadata / draft / flags. */
export const PATCH = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const template = await prisma.formTemplate.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, isActive: true },
    })
    if (!template) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 })

    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const data = parsed.data

    const updateData: Prisma.FormTemplateUpdateInput = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.autoSendOnIntakeApproval !== undefined) {
      updateData.autoSendOnIntakeApproval = data.autoSendOnIntakeApproval
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    if (data.draftFields !== undefined) {
      const result = validateFields(data.draftFields)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      updateData.draftFields = result.fields as unknown as Prisma.InputJsonValue
    }

    const updated = await prisma.formTemplate.update({ where: { id: template.id }, data: updateData })

    const deactivated = data.isActive === false && template.isActive
    await audit.log({
      user,
      action: deactivated ? AuditAction.FORM_TEMPLATE_DEACTIVATED : AuditAction.FORM_TEMPLATE_UPDATED,
      entityType: "FormTemplate",
      entityId: template.id,
      request: req,
    })

    return NextResponse.json({
      template: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
        autoSendOnIntakeApproval: updated.autoSendOnIntakeApproval,
      },
    })
  }
)

/** DELETE /api/forms/templates/[id] — soft delete (deactivate). */
export const DELETE = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const result = await prisma.formTemplate.updateMany({
      where: { id: params.id, clinicId: user.clinicId },
      data: { isActive: false },
    })
    if (result.count === 0) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 })

    await audit.log({
      user,
      action: AuditAction.FORM_TEMPLATE_DEACTIVATED,
      entityType: "FormTemplate",
      entityId: params.id,
      request: req,
    })

    return NextResponse.json({ message: "Modelo desativado" })
  }
)
