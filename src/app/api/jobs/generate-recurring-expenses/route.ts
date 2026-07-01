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
    // Build the horizon in UTC to match the UTC date math in generateExpensesFromRecurrence
    // (dueDate / lastGeneratedDate are @db.Date, i.e. UTC midnight).
    const threeMonthsAhead = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, now.getUTCDate()))

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

        // Defense in depth: never create a second expense for the same recurrence + dueDate,
        // even if the date math regresses. (Mirrors the existence check in the auto-reconcile route.)
        const existing = await prisma.expense.findMany({
          where: { recurrenceId: recurrence.id, dueDate: { in: inputs.map((i) => i.dueDate) } },
          select: { dueDate: true },
        })
        const existingDueDates = new Set(existing.map((e) => e.dueDate.getTime()))
        const newInputs = inputs.filter((i) => !existingDueDates.has(i.dueDate.getTime()))

        if (newInputs.length === 0) {
          // Still advance lastGeneratedDate so the cursor doesn't re-scan these every run.
          await prisma.expenseRecurrence.update({
            where: { id: recurrence.id },
            data: { lastGeneratedDate: inputs[inputs.length - 1].dueDate },
          })
          results.recurrencesSkipped++
          continue
        }

        await prisma.$transaction(async (tx) => {
          for (const input of newInputs) {
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
        results.expensesCreated += newInputs.length

        // Audit log per clinic
        await prisma.auditLog.create({
          data: {
            clinicId: recurrence.clinicId,
            userId: null,
            action: "RECURRING_EXPENSES_GENERATED",
            entityType: "ExpenseRecurrence",
            entityId: recurrence.id,
            newValues: { count: newInputs.length, recurrence: recurrence.description },
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
