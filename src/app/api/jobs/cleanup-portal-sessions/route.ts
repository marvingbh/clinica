import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/jobs/cleanup-portal-sessions
 * Deletes expired portal OTPs and portal sessions whose sliding expiry passed
 * more than 7 days ago. Runs daily (0 4 * * *).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const sessionCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [otps, sessions] = await Promise.all([
    prisma.patientPortalOtp.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.patientPortalSession.deleteMany({ where: { expiresAt: { lt: sessionCutoff } } }),
  ])

  return NextResponse.json({
    otpsDeleted: otps.count,
    sessionsDeleted: sessions.count,
  })
}
