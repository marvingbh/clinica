import { NextResponse } from "next/server"
import { GET as sendReminders } from "../send-reminders/route"
import { GET as extendRecurrences } from "../extend-recurrences/route"
import { GET as generateRecurringExpenses } from "../generate-recurring-expenses/route"
import { GET as markOverdueExpenses } from "../mark-overdue-expenses/route"

/**
 * GET /api/jobs/run-daily
 *
 * Single daily dispatcher cron. The Vercel Hobby plan allows only 2 cron
 * jobs per project, so the four periodic jobs are consolidated here and run
 * sequentially from one daily invocation. Each underlying job is idempotent,
 * so running them daily (rather than on their original individual cadences)
 * is safe.
 *
 * The individual /api/jobs/* routes remain callable for manual triggering.
 *
 * Schedule: 0 2 * * * (every day at 2:00 AM UTC)
 */

// Each job iterates every clinic/recurrence, so give the dispatcher the full
// Hobby duration budget.
export const maxDuration = 60

const JOBS = [
  { name: "extend-recurrences", run: extendRecurrences },
  { name: "send-reminders", run: sendReminders },
  { name: "generate-recurring-expenses", run: generateRecurringExpenses },
  { name: "mark-overdue-expenses", run: markOverdueExpenses },
] as const

export async function GET(req: Request) {
  // Verify Vercel Cron secret to prevent unauthorized access.
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const jobs: Record<string, unknown> = {}

  // Re-issue an authorized request to each underlying job handler. Run
  // sequentially so a single job's failure doesn't abort the rest.
  const authedReq = new Request("https://internal/run-daily", {
    headers: { authorization: authHeader },
  })

  for (const job of JOBS) {
    try {
      const res = await job.run(authedReq)
      jobs[job.name] = { status: res.status, ...(await res.json().catch(() => ({}))) }
    } catch (error) {
      jobs[job.name] = {
        status: 500,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  return NextResponse.json({
    success: true,
    executionTimeMs: Date.now() - startTime,
    jobs,
  })
}

// Also support POST for manual triggering / testing.
export { GET as POST }
