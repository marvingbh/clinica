import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { DEFAULT_TEMPLATES, validateSectionDefs } from "@/lib/prontuario"
import { createTemplateSchema } from "../_schemas"

/**
 * GET /api/prontuario/templates — list active templates; lazily seed the 3
 * default templates on a clinic's first access.
 */
export const GET = withFeatureAuth(
  { feature: "prontuario", minAccess: "READ" },
  async (_req, { user }) => {
    const existing = await prisma.noteTemplate.count({ where: { clinicId: user.clinicId } })
    if (existing === 0) {
      await prisma.noteTemplate.createMany({
        data: DEFAULT_TEMPLATES.map((t) => ({
          clinicId: user.clinicId,
          name: t.name,
          format: t.format,
          sectionDefs: t.sectionDefs as unknown as Prisma.InputJsonValue,
          isActive: true,
        })),
        skipDuplicates: true,
      })
    }

    const templates = await prisma.noteTemplate.findMany({
      where: { clinicId: user.clinicId, isActive: true },
      orderBy: { name: "asc" },
    })
    return NextResponse.json({ templates })
  }
)

/** POST /api/prontuario/templates — create a custom template. */
export const POST = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json().catch(() => null)
    const parsed = createTemplateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

    let sectionDefs
    try {
      sectionDefs = validateSectionDefs(parsed.data.sectionDefs)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Seções inválidas." },
        { status: 422 }
      )
    }

    try {
      const template = await prisma.noteTemplate.create({
        data: {
          clinicId: user.clinicId,
          name: parsed.data.name,
          format: parsed.data.format,
          sectionDefs: sectionDefs as unknown as Prisma.InputJsonValue,
          isActive: true,
        },
      })
      return NextResponse.json({ template }, { status: 201 })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: "Já existe um modelo com esse nome." }, { status: 409 })
      }
      throw e
    }
  }
)
