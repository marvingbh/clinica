import { NextResponse } from "next/server"
import { processCalendarSyncJobs } from "@/lib/calendar-sync"

/**
 * GET /api/jobs/process-calendar-sync
 * Vercel Cron (every 10 min). Drains pending calendar-sync jobs — the
 * guaranteed sweep for retries and any flush that didn't complete.
 * Protected by the shared CRON_SECRET bearer token.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  try {
    const result = await processCalendarSyncJobs(100)
    return NextResponse.json({ success: true, executionTimeMs: Date.now() - startTime, ...result })
  } catch (error) {
    console.error("[process-calendar-sync] error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export { GET as POST }
