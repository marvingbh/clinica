import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"

const createSchema = z.object({
  description: z.string().min(1),
  supplierName: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: z.number().positive(),
  paymentMethod: z.string().nullable().optional(),
  frequency: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
  dayOfMonth: z.number().int().min(1).max(31).default(1),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string().nullable().optional(),
})

export const GET = withFeatureAuth(
  { feature: "expenses", minAccess: "READ" },
  async (req, { user }) => {
    const recurrences = await prisma.expenseRecurrence.findMany({
      where: { clinicId: user.clinicId },
      orderBy: [{ active: "desc" }, { description: "asc" }],
    })

    return NextResponse.json(recurrences)
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

    const recurrence = await prisma.expenseRecurrence.create({
      data: {
        clinicId: user.clinicId,
        description: parsed.data.description,
        supplierName: parsed.data.supplierName ?? null,
        categoryId: parsed.data.categoryId ?? null,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod ?? null,
        frequency: parsed.data.frequency,
        dayOfMonth: parsed.data.dayOfMonth,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        active: true,
      },
    })

    audit.log({
      user,
      action: AuditAction.EXPENSE_RECURRENCE_CREATED,
      entityType: "ExpenseRecurrence",
      entityId: recurrence.id,
      newValues: { description: recurrence.description, amount: Number(recurrence.amount), frequency: recurrence.frequency },
      request: req,
    }).catch(() => {})

    return NextResponse.json(recurrence, { status: 201 })
  }
)
