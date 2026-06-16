import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { verifyResendDomain, ResendDomainError } from "@/lib/email/resend-domains"

/** Ask Resend to (re)check DNS for the clinic's domain and persist the status. */
export const POST = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (_req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { emailDomainResendId: true },
    })
    if (!clinic?.emailDomainResendId) {
      return NextResponse.json({ error: "Nenhum domínio configurado." }, { status: 400 })
    }
    try {
      const d = await verifyResendDomain(clinic.emailDomainResendId)
      const updated = await prisma.clinic.update({
        where: { id: user.clinicId },
        data: {
          emailDomainStatus: d.status,
          emailDomainRecords: d.records as unknown as Prisma.InputJsonValue,
        },
        select: { emailDomainStatus: true, emailDomainRecords: true },
      })
      return NextResponse.json({ status: updated.emailDomainStatus, records: updated.emailDomainRecords })
    } catch (e) {
      if (e instanceof ResendDomainError) {
        return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 400 : e.status })
      }
      throw e
    }
  }
)
