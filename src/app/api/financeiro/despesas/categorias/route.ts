import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { DEFAULT_CATEGORIES } from "@/lib/expenses"

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#6B7280"),
  icon: z.string().nullable().optional(),
})

export const GET = withFeatureAuth(
  { feature: "expenses", minAccess: "READ" },
  async (req, { user }) => {
    // Ensure default categories exist on first access
    const count = await prisma.expenseCategory.count({ where: { clinicId: user.clinicId } })
    if (count === 0) {
      await prisma.expenseCategory.createMany({
        data: DEFAULT_CATEGORIES.map((cat) => ({
          clinicId: user.clinicId,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          isDefault: true,
        })),
        skipDuplicates: true,
      })
    }

    const categories = await prisma.expenseCategory.findMany({
      where: { clinicId: user.clinicId },
      include: { _count: { select: { expenses: true } } },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(categories)
  }
)

export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    // Check for duplicate name
    const existing = await prisma.expenseCategory.findFirst({
      where: { clinicId: user.clinicId, name: parsed.data.name },
    })
    if (existing) {
      return NextResponse.json({ error: "Já existe uma categoria com este nome" }, { status: 409 })
    }

    const category = await prisma.expenseCategory.create({
      data: {
        clinicId: user.clinicId,
        name: parsed.data.name,
        color: parsed.data.color,
        icon: parsed.data.icon ?? null,
        isDefault: false,
      },
    })

    return NextResponse.json(category, { status: 201 })
  }
)
