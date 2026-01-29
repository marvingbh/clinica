import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api/with-auth"
import { getNotificationsByAppointment } from "@/lib/notifications"

/**
 * GET /api/appointments/:id/notifications
 * Returns all notifications for a specific appointment
 */
export const GET = withAuth(
  { resource: "notification", action: "list" },
  async (req: NextRequest, { user, scope }, params) => {
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

    // For professionals with 'own' scope, verify they own the appointment
    if (
      scope === "own" &&
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
