import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"

const schema = z.object({
  enabled: z.boolean(),
  offsets: z.array(z.number().int().min(-30).max(60)).min(1).max(8),
  sendWhatsApp: z.boolean(),
  sendEmail: z.boolean(),
  maxAttempts: z.number().int().min(1).max(12),
  linkExpirationDays: z.number().int().min(1).max(30),
  autoChargeOnInvoiceCreation: z.boolean(),
})

export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (_req, { user }) => {
    const config = await prisma.dunningConfig.findUnique({
      where: { clinicId: user.clinicId },
    })
    return NextResponse.json({ config })
  }
)

export const PUT = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const data = parsed.data

    const config = await prisma.dunningConfig.upsert({
      where: { clinicId: user.clinicId },
      create: { clinicId: user.clinicId, ...data },
      update: data,
    })

    await audit.log({
      user,
      action: AuditAction.DUNNING_CONFIG_UPDATED,
      entityType: "DunningConfig",
      entityId: config.id,
      newValues: { ...data },
      request: req,
    })

    return NextResponse.json({ config })
  }
)
