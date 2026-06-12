import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { extractPlaceholderKeys, getPlaceholder } from "@/lib/documents"

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
})

export const PATCH = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }, params) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const existing = await prisma.clinicDocumentTemplate.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 })

    const { name, body, isActive } = parsed.data
    if (body) {
      const unknownKeys = extractPlaceholderKeys(body).filter((k) => !getPlaceholder(k))
      if (unknownKeys.length > 0) {
        return NextResponse.json({ error: "Placeholders desconhecidos", unknownKeys }, { status: 422 })
      }
    }

    const updated = await prisma.clinicDocumentTemplate.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: { id: true, type: true, name: true, isActive: true },
    })

    await audit.log({
      user,
      action: AuditAction.DOCUMENT_TEMPLATE_UPDATED,
      entityType: "ClinicDocumentTemplate",
      entityId: updated.id,
      newValues: { templateName: updated.name, isActive: updated.isActive },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ template: updated })
  }
)

export const DELETE = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }, params) => {
    const existing = await prisma.clinicDocumentTemplate.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, name: true },
    })
    if (!existing) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 })

    await prisma.clinicDocumentTemplate.update({
      where: { id: existing.id },
      data: { isActive: false },
    })

    await audit.log({
      user,
      action: AuditAction.DOCUMENT_TEMPLATE_DEACTIVATED,
      entityType: "ClinicDocumentTemplate",
      entityId: existing.id,
      newValues: { templateName: existing.name },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  }
)
