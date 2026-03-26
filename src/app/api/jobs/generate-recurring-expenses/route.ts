import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateExpensesFromRecurrence } from "@/lib/expenses"

/**
 * GET /api/jobs/generate-recurring-expenses
 * Generates future expense entries from active recurrence templates.
 * Generates up to 3 months ahead, runs daily at 03:00 UTC.
 *
 * Schedule: 0 3 * * *
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const results = {
    recurrencesProcessed: 0,
    expensesCreated: 0,
    recurrencesSkipped: 0,
    errors: [] as string[],
  }

  try {
    const recurrences = await prisma.expenseRecurrence.findMany({
      where: { active: true },
    })

    const now = new Date()
    const threeMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())

    for (const recurrence of recurrences) {
      try {
        const inputs = generateExpensesFromRecurrence(
          {
            ...recurrence,
            amount: Number(recurrence.amount),
          },
          threeMonthsAhead
        )

        if (inputs.length === 0) {
          results.recurrencesSkipped++
          continue
        }

        await prisma.$transaction(async (tx) => {
          for (const input of inputs) {
            await tx.expense.create({
              data: {
                clinicId: input.clinicId,
                description: input.description,
                supplierName: input.supplierName ?? null,
                categoryId: input.categoryId ?? null,
                amount: input.amount,
                dueDate: input.dueDate,
                status: "OPEN",
                paymentMethod: input.paymentMethod ?? null,
                recurrenceId: input.recurrenceId ?? null,
              },
            })
          }

          // Update lastGeneratedDate to the latest generated due date
          const lastDate = inputs[inputs.length - 1].dueDate
          await tx.expenseRecurrence.update({
            where: { id: recurrence.id },
            data: { lastGeneratedDate: lastDate },
          })
        })

        results.recurrencesProcessed++
        results.expensesCreated += inputs.length

        // Audit log per clinic
        await prisma.auditLog.create({
          data: {
            clinicId: recurrence.clinicId,
            userId: null,
            action: "RECURRING_EXPENSES_GENERATED",
            entityType: "ExpenseRecurrence",
            entityId: recurrence.id,
            newValues: { count: inputs.length, recurrence: recurrence.description },
          },
        }).catch(() => {})
      } catch (err) {
        results.errors.push(`Recurrence ${recurrence.id}: ${err instanceof Error ? err.message : "Unknown error"}`)
      }
    }

    return NextResponse.json({
      success: true,
      executionTimeMs: Date.now() - startTime,
      ...results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: Date.now() - startTime,
        ...results,
      },
      { status: 500 }
    )
  }
}

export { GET as POST }
