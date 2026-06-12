import { NextResponse } from "next/server"
import { runWaitlistCron } from "@/lib/waitlist"

/**
 * GET /api/jobs/waitlist-offers
 * Vercel Cron (every 15 min). Expires due offers and advances sequential
 * chains. Authenticated via the shared CRON_SECRET bearer token.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  try {
    const results = await runWaitlistCron(new Date())
    return NextResponse.json({
      success: true,
      executionTimeMs: Date.now() - startTime,
      ...results,
    })
  } catch (error) {
    console.error("[waitlist-offers] Critical error:", error)
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

// Support POST for manual testing.
export { GET as POST }
