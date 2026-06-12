import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withPortalSession } from "@/lib/patient-portal/with-portal-session"
import { clearPortalCookie } from "@/lib/patient-portal/portal-cookies"

/**
 * DELETE /api/public/portal/[slug]/session — logout: revoke + clear cookie.
 */
export const DELETE = withPortalSession(async (_req, ctx, params) => {
  await prisma.patientPortalSession.update({
    where: { id: ctx.session.id },
    data: { revokedAt: new Date() },
  })
  await clearPortalCookie(params.slug)
  return NextResponse.json({ ok: true })
})
