import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { createResendDomain, deleteResendDomain, ResendDomainError } from "@/lib/email/resend-domains"

const bodySchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((d) => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""))
    .pipe(
      z
        .string()
        .regex(
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
          "Domínio inválido (use algo como suaclinica.com.br)"
        )
    ),
})

/** Current custom-domain status + DNS records + the shared SaaS domain. */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (_req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { emailDomain: true, emailDomainStatus: true, emailDomainRecords: true, emailFromAddress: true },
    })
    return NextResponse.json({
      domain: clinic?.emailDomain ?? null,
      status: clinic?.emailDomainStatus ?? null,
      records: clinic?.emailDomainRecords ?? null,
      fromAddress: clinic?.emailFromAddress ?? null,
      sharedDomain: process.env.EMAIL_SHARED_DOMAIN ?? null,
    })
  }
)

/** Create the domain in Resend, persist the DNS records, set status=pending. */
export const POST = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (_req, { user }) => {
    const parsed = bodySchema.safeParse(await _req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const domain = parsed.data.domain
    try {
      const created = await createResendDomain(domain)
      const updated = await prisma.clinic.update({
        where: { id: user.clinicId },
        data: {
          emailDomain: domain,
          emailDomainResendId: created.id,
          emailDomainStatus: created.status,
          emailDomainRecords: created.records as unknown as Prisma.InputJsonValue,
          emailFromAddress: `naoresponda@${domain}`,
        },
        select: { emailDomain: true, emailDomainStatus: true, emailDomainRecords: true, emailFromAddress: true },
      })
      return NextResponse.json({
        domain: updated.emailDomain,
        status: updated.emailDomainStatus,
        records: updated.emailDomainRecords,
        fromAddress: updated.emailFromAddress,
      })
    } catch (e) {
      if (e instanceof ResendDomainError) {
        return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 400 : e.status })
      }
      throw e
    }
  }
)

/** Remove the custom domain (revert to the shared SaaS sender). */
export const DELETE = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { emailDomainResendId: true },
    })
    if (clinic?.emailDomainResendId) {
      try {
        await deleteResendDomain(clinic.emailDomainResendId)
      } catch {
        // best-effort remote delete; always clear locally below
      }
    }
    await prisma.clinic.update({
      where: { id: user.clinicId },
      data: {
        emailDomain: null,
        emailDomainResendId: null,
        emailDomainStatus: null,
        emailDomainRecords: Prisma.DbNull,
        emailFromAddress: null,
      },
    })
    return NextResponse.json({ ok: true })
  }
)
