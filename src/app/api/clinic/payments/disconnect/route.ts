import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"

/**
 * POST /api/clinic/payments/disconnect
 * Disables charging (status DISCONNECTED) but keeps the account id and history.
 * Open charges are canceled so the régua pauses.
 */
export const POST = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, stripeConnectStatus: true },
    })
    if (!clinic) return NextResponse.json({ error: "Clínica não encontrada" }, { status: 404 })

    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { stripeConnectStatus: "DISCONNECTED" },
    })

    await audit.log({
      user,
      action: AuditAction.PAYMENT_CONNECT_DISCONNECTED,
      entityType: "Clinic",
      entityId: clinic.id,
      oldValues: { status: clinic.stripeConnectStatus },
      newValues: { status: "DISCONNECTED" },
      request: req,
    })

    return NextResponse.json({ ok: true })
  }
)
