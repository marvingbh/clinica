import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { SEED_TEMPLATES } from "@/lib/forms"

/**
 * POST /api/forms/templates/seed — copies the pt-BR starter library into the
 * clinic as drafts, skipping names that already exist.
 */
export const POST = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    const existing = await prisma.formTemplate.findMany({
      where: { clinicId: user.clinicId },
      select: { name: true },
    })
    const existingNames = new Set(existing.map((t) => t.name))

    const toCreate = SEED_TEMPLATES.filter((t) => !existingNames.has(t.name))
    if (toCreate.length === 0) {
      return NextResponse.json({ created: 0 }, { status: 201 })
    }

    await prisma.formTemplate.createMany({
      data: toCreate.map((t) => ({
        clinicId: user.clinicId,
        name: t.name,
        description: t.description,
        draftFields: t.fields as unknown as Prisma.InputJsonValue,
        createdByUserId: user.id,
      })),
    })

    await audit.log({
      user,
      action: AuditAction.FORM_TEMPLATE_CREATED,
      entityType: "FormTemplate",
      entityId: "seed",
      newValues: { created: toCreate.length, source: "seed-library" },
      request: req,
    })

    return NextResponse.json({ created: toCreate.length }, { status: 201 })
  }
)
