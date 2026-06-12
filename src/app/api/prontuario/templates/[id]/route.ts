import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { updateTemplateSchema } from "../../_schemas"

/** PATCH /api/prontuario/templates/[id] — rename or deactivate. */
export const PATCH = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json().catch(() => null)
    const parsed = updateTemplateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

    const result = await prisma.noteTemplate.updateMany({
      where: { id: params.id, clinicId: user.clinicId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  }
)

/**
 * DELETE /api/prontuario/templates/[id] — soft-delete (deactivate). Never
 * hard-deletes; notes reference templates with onDelete: SetNull.
 */
export const DELETE = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (_req, { user }, params) => {
    const result = await prisma.noteTemplate.updateMany({
      where: { id: params.id, clinicId: user.clinicId },
      data: { isActive: false },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  }
)
