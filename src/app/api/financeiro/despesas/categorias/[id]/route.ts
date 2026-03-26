import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  icon: z.string().nullable().optional(),
})

export const PATCH = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const category = await prisma.expenseCategory.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
    })
    if (!category) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
    }

    // Check name uniqueness if changing name
    if (parsed.data.name && parsed.data.name !== category.name) {
      const existing = await prisma.expenseCategory.findFirst({
        where: { clinicId: user.clinicId, name: parsed.data.name, NOT: { id: params.id } },
      })
      if (existing) {
        return NextResponse.json({ error: "Já existe uma categoria com este nome" }, { status: 409 })
      }
    }

    const updated = await prisma.expenseCategory.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.color !== undefined && { color: parsed.data.color }),
        ...(parsed.data.icon !== undefined && { icon: parsed.data.icon }),
      },
    })

    return NextResponse.json(updated)
  }
)

export const DELETE = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const category = await prisma.expenseCategory.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: { _count: { select: { expenses: true } } },
    })

    if (!category) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
    }

    if (category._count.expenses > 0) {
      return NextResponse.json(
        { error: `Não é possível excluir: ${category._count.expenses} despesa(s) usam esta categoria` },
        { status: 409 }
      )
    }

    await prisma.expenseCategory.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  }
)
