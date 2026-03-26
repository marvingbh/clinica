import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/jobs/mark-overdue-expenses
 * Marks OPEN expenses past their due date as OVERDUE.
 * Uses a single updateMany to avoid race conditions.
 *
 * Schedule: 0 6 * * * (daily at 06:00 UTC = 03:00 BRT)
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const result = await prisma.expense.updateMany({
      where: {
        status: "OPEN",
        dueDate: { lt: today },
      },
      data: { status: "OVERDUE" },
    })

    // Audit log per affected clinic
    if (result.count > 0) {
      const affectedClinics = await prisma.expense.groupBy({
        by: ["clinicId"],
        where: { status: "OVERDUE", updatedAt: { gte: new Date(startTime) } },
        _count: true,
      })

      for (const { clinicId, _count } of affectedClinics) {
        await prisma.auditLog.create({
          data: {
            clinicId,
            userId: null,
            action: "OVERDUE_EXPENSES_MARKED",
            entityType: "Expense",
            entityId: "batch",
            newValues: { count: _count },
          },
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      success: true,
      executionTimeMs: Date.now() - startTime,
      markedOverdue: result.count,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

export { GET as POST }
