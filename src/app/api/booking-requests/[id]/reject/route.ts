import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction, meetsMinAccess } from "@/lib/rbac"
import { notifyContactRejection } from "@/app/api/public/booking/_lib/notify-booking"

/**
 * POST /api/booking-requests/[id]/reject
 * Body: { reason?: string }
 */
export const POST = withFeatureAuth(
  { feature: "online_booking", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json().catch(() => ({}))
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null

    const request = await prisma.bookingRequest.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
    })
    if (!request) {
      return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 })
    }

    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    if (!canSeeOthers && request.professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 })
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Esta solicitação já foi revisada." }, { status: 422 })
    }

    await prisma.bookingRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
      },
    })

    await audit.log({
      user,
      action: AuditAction.BOOKING_REQUEST_REJECTED,
      entityType: "BookingRequest",
      entityId: request.id,
      newValues: { reason: reason ?? undefined },
      request: req,
    })

    // Best-effort courtesy reply to the contact.
    try {
      const clinic = await prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { name: true },
      })
      await notifyContactRejection({
        clinicId: user.clinicId,
        patientName: request.name,
        contactPhone: request.phone,
        contactEmail: request.email,
        consentWhatsApp: request.consentWhatsApp,
        consentEmail: request.consentEmail,
        scheduledAt: request.scheduledAt,
        reason,
        clinicName: clinic?.name ?? "",
      })
    } catch (err) {
      console.error("Booking rejection notification failed:", err)
    }

    return NextResponse.json({ status: "rejected" })
  }
)
