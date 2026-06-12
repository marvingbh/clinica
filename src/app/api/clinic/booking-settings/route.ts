import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { bookingSettingsSchema } from "@/lib/booking"
import { normalizePhone } from "@/lib/phone"

const DEFAULTS = {
  enabled: false,
  mode: "APPROVAL_REQUIRED" as const,
  sessionDurationMinutes: 50,
  minAdvanceHours: 12,
  horizonDays: 30,
  allowedModalities: ["ONLINE", "PRESENCIAL"] as ("ONLINE" | "PRESENCIAL")[],
  maxOpenBookingsPerPhone: 2,
  blockedPhones: [] as string[],
}

/**
 * GET /api/clinic/booking-settings — returns the clinic's settings (or defaults).
 */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (_req, { user }) => {
    const settings = await prisma.onlineBookingSettings.findUnique({
      where: { clinicId: user.clinicId },
    })
    return NextResponse.json({ settings: settings ?? { clinicId: user.clinicId, ...DEFAULTS } })
  }
)

/**
 * PUT /api/clinic/booking-settings — upsert the clinic's settings.
 */
export const PUT = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json().catch(() => null)
    const parsed = bookingSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const data = parsed.data

    // Normalize + de-duplicate blocked phones, dropping blanks.
    const blockedPhones = Array.from(
      new Set(
        data.blockedPhones
          .map((p) => normalizePhone(p))
          .filter((p) => p.replace(/\D/g, "").length > 0)
      )
    )

    const payload = { ...data, blockedPhones }

    const settings = await prisma.onlineBookingSettings.upsert({
      where: { clinicId: user.clinicId },
      update: payload,
      create: { clinicId: user.clinicId, ...payload },
    })

    await audit.log({
      user,
      action: AuditAction.BOOKING_SETTINGS_UPDATED,
      entityType: "OnlineBookingSettings",
      entityId: settings.id,
      newValues: {
        enabled: settings.enabled,
        mode: settings.mode,
        minAdvanceHours: settings.minAdvanceHours,
        horizonDays: settings.horizonDays,
        allowedModalities: settings.allowedModalities,
        maxOpenBookingsPerPhone: settings.maxOpenBookingsPerPhone,
        blockedPhonesCount: settings.blockedPhones.length,
      },
      request: req,
    })

    return NextResponse.json({ settings })
  }
)
