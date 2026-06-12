import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import {
  SYSTEM_TEMPLATES,
  DOCUMENT_TYPES,
  extractPlaceholderKeys,
  getPlaceholder,
} from "@/lib/documents"

const createSchema = z.object({
  type: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  body: z.string().trim().min(1, "Corpo obrigatório"),
})

export const GET = withFeatureAuth(
  { feature: "documents", minAccess: "READ" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "1"
    const custom = await prisma.clinicDocumentTemplate.findMany({
      where: { clinicId: user.clinicId, ...(includeInactive ? {} : { isActive: true }) },
      select: { id: true, type: true, name: true, body: true, isActive: true, updatedAt: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    })
    const system = DOCUMENT_TYPES.map((type) => ({
      type,
      name: SYSTEM_TEMPLATES[type].name,
      body: SYSTEM_TEMPLATES[type].body,
    }))
    return NextResponse.json({ system, custom })
  }
)

export const POST = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { type, name, body } = parsed.data

    const unknownKeys = extractPlaceholderKeys(body).filter((k) => !getPlaceholder(k))
    if (unknownKeys.length > 0) {
      return NextResponse.json({ error: "Placeholders desconhecidos", unknownKeys }, { status: 422 })
    }

    const existing = await prisma.clinicDocumentTemplate.findFirst({
      where: { clinicId: user.clinicId, type: type as never, name },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: "Já existe um modelo com esse nome para este tipo" }, { status: 409 })
    }

    const tpl = await prisma.clinicDocumentTemplate.create({
      data: { clinicId: user.clinicId, type: type as never, name, body },
      select: { id: true, type: true, name: true, isActive: true },
    })
    await audit.log({
      user,
      action: AuditAction.DOCUMENT_TEMPLATE_CREATED,
      entityType: "ClinicDocumentTemplate",
      entityId: tpl.id,
      newValues: { templateType: type, templateName: name },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ template: tpl }, { status: 201 })
  }
)
