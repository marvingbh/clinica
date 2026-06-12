import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { toPortalPatient } from "@/lib/patient-portal"
import { withPortalSession } from "@/lib/patient-portal/with-portal-session"

/**
 * GET /api/public/portal/[slug]/me
 * Current clinic branding, access level, scope, and the minimized profiles the
 * session can act on.
 */
export const GET = withPortalSession(async (_req, ctx) => {
  const now = new Date()
  const patients = await prisma.patient.findMany({
    where: { id: { in: ctx.patientIds }, clinicId: ctx.clinic.id },
    select: {
      id: true,
      name: true,
      birthDate: true,
      phone: true,
      email: true,
      addressStreet: true,
      addressNumber: true,
      addressNeighborhood: true,
      addressCity: true,
      addressState: true,
      addressZip: true,
      consentWhatsApp: true,
      consentEmail: true,
    },
  })

  return NextResponse.json({
    clinic: {
      name: ctx.clinic.name,
      hasLogo: ctx.clinic.hasLogo,
      cancelMinHours: ctx.clinic.portalCancelMinHours,
    },
    access: ctx.access,
    scope: ctx.session.scope,
    profiles: patients.map((p) => toPortalPatient(p, now)),
  })
})
