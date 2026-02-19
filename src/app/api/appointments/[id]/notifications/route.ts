import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api/with-auth"
import { meetsMinAccess } from "@/lib/rbac"
import { getNotificationsByAppointment } from "@/lib/notifications"

/**
 * GET /api/appointments/:id/notifications
 * Returns all notifications for a specific appointment
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const appointmentId = params.id

    // First verify the appointment exists and belongs to the user's clinic
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        clinicId: true,
        professionalProfileId: true,
      },
    })

    if (!appointment) {
      return NextResponse.json(
        { error: "Not found", message: "Appointment not found" },
        { status: 404 }
      )
    }

    // Verify clinic ownership
    if (appointment.clinicId !== user.clinicId) {
      return NextResponse.json(
        { error: "Forbidden", message: "Access denied" },
        { status: 403 }
      )
    }

    // If user cannot see others' appointments, verify they own the appointment
    if (
      !canSeeOthers &&
      appointment.professionalProfileId !== user.professionalProfileId
    ) {
      return NextResponse.json(
        { error: "Forbidden", message: "Access denied" },
        { status: 403 }
      )
    }

    const notifications = await getNotificationsByAppointment(appointmentId)

    return NextResponse.json({
      data: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        channel: n.channel,
        status: n.status,
        recipient: n.recipient,
        subject: n.subject,
        content: n.content,
        attempts: n.attempts,
        maxAttempts: n.maxAttempts,
        sentAt: n.sentAt,
        failedAt: n.failedAt,
        failureReason: n.failureReason,
        createdAt: n.createdAt,
      })),
    })
  }
)
