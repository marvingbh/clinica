import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma, ExpenseStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { DEFAULT_CATEGORIES } from "@/lib/expenses"

const createSchema = z.object({
  description: z.string().min(1),
  supplierName: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: z.number().positive(),
  dueDate: z.string(), // YYYY-MM-DD
  paymentMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const GET = withFeatureAuth(
  { feature: "expenses", minAccess: "READ" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const status = url.searchParams.getAll("status")
    const categoryId = url.searchParams.get("categoryId")
    const supplierName = url.searchParams.get("supplierName")
    const year = url.searchParams.get("year")
    const month = url.searchParams.get("month")

    const where: Prisma.ExpenseWhereInput = { clinicId: user.clinicId }
    if (status.length > 0) where.status = { in: status as ExpenseStatus[] }
    if (categoryId) where.categoryId = categoryId
    if (supplierName) where.supplierName = { contains: supplierName, mode: "insensitive" }
    if (year) {
      const y = parseInt(year)
      const m = month ? parseInt(month) - 1 : undefined
      const start = new Date(y, m ?? 0, 1)
      const end = m !== undefined ? new Date(y, m + 1, 1) : new Date(y + 1, 0, 1)
      where.dueDate = { gte: start, lt: end }
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: { dueDate: "asc" },
    })

    return NextResponse.json(expenses)
  }
)

export const POST = withFeatureAuth(
  { feature: "expenses", minAccess: "WRITE" },
  async (req, { user }) => {
    // Ensure default categories exist
    await ensureDefaultCategories(user.clinicId)

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
    }

    const expense = await prisma.expense.create({
      data: {
        clinicId: user.clinicId,
        description: parsed.data.description,
        supplierName: parsed.data.supplierName ?? null,
        categoryId: parsed.data.categoryId ?? null,
        amount: parsed.data.amount,
        dueDate: new Date(parsed.data.dueDate),
        status: "OPEN",
        paymentMethod: parsed.data.paymentMethod ?? null,
        notes: parsed.data.notes ?? null,
        createdByUserId: user.id,
      },
      include: { category: { select: { id: true, name: true, color: true } } },
    })

    audit.log({
      user,
      action: AuditAction.EXPENSE_CREATED,
      entityType: "Expense",
      entityId: expense.id,
      newValues: { description: expense.description, amount: Number(expense.amount) },
      request: req,
    }).catch(() => {})

    return NextResponse.json(expense, { status: 201 })
  }
)

async function ensureDefaultCategories(clinicId: string) {
  const count = await prisma.expenseCategory.count({ where: { clinicId } })
  if (count > 0) return

  await prisma.expenseCategory.createMany({
    data: DEFAULT_CATEGORIES.map((cat) => ({
      clinicId,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      isDefault: true,
    })),
    skipDuplicates: true,
  })
}
