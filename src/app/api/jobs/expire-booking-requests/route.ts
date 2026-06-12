import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/jobs/expire-booking-requests
 *
 * Marks PENDING booking requests whose slot has already passed as EXPIRED.
 * Platform-wide job (no clinic filter), like the other crons. Idempotent via
 * a single updateMany.
 *
 * Schedule: 0 5 * * * (daily at 05:00 UTC = 02:00 BRT)
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const result = await prisma.bookingRequest.updateMany({
    where: { status: "PENDING", scheduledAt: { lt: now } },
    data: { status: "EXPIRED" },
  })

  return NextResponse.json({ expired: result.count })
}

export { GET as POST }
