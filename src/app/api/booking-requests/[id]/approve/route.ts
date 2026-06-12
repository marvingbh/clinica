import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction, meetsMinAccess } from "@/lib/rbac"
import { approveBookingRequest } from "../../_lib/approve"
import { notifyPatientConfirmation } from "@/app/api/public/booking/_lib/notify-booking"

/**
 * POST /api/booking-requests/[id]/approve
 * Body: {} | { patientId } | { newPatient: { name, phone, email?, cpf? } }
 */
export const POST = withFeatureAuth(
  { feature: "online_booking", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json().catch(() => ({}))
    const restrictToProfessionalId = meetsMinAccess(user.permissions.agenda_others, "READ")
      ? null
      : user.professionalProfileId

    const outcome = await approveBookingRequest({
      requestId: params.id,
      clinicId: user.clinicId,
      userId: user.id,
      restrictToProfessionalId,
      linkPatientId: typeof body.patientId === "string" ? body.patientId : undefined,
      newPatient: body.newPatient ?? undefined,
    })

    switch (outcome.kind) {
      case "not_found":
        return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 })
      case "not_pending":
        return NextResponse.json({ error: "Esta solicitação já foi revisada." }, { status: 422 })
      case "expired":
        return NextResponse.json({ error: "Esta solicitação expirou." }, { status: 422 })
      case "bad_patient":
        return NextResponse.json(
          { error: "Não foi possível resolver o paciente. Verifique os dados." },
          { status: 400 }
        )
      case "conflict":
        return NextResponse.json(outcome.error, { status: 409 })
      case "ok":
        break
    }

    await audit.log({
      user,
      action: AuditAction.BOOKING_REQUEST_APPROVED,
      entityType: "BookingRequest",
      entityId: params.id,
      newValues: { appointmentId: outcome.appointmentId, patientId: outcome.patientId },
      request: req,
    })

    // Best-effort confirmation to the patient.
    try {
      await sendConfirmation(user.clinicId, params.id, outcome.appointmentId)
    } catch (err) {
      console.error("Booking approval confirmation failed:", err)
    }

    return NextResponse.json({ status: "approved", appointmentId: outcome.appointmentId })
  }
)

async function sendConfirmation(clinicId: string, requestId: string, appointmentId: string): Promise<void> {
  const [request, appointment, clinic] = await Promise.all([
    prisma.bookingRequest.findFirst({ where: { id: requestId, clinicId } }),
    prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId },
      select: {
        scheduledAt: true,
        modality: true,
        patient: {
          select: { id: true, name: true, email: true, phone: true, consentWhatsApp: true, consentEmail: true },
        },
        professionalProfile: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } }),
  ])
  if (!appointment?.patient || !request || !clinic) return

  await notifyPatientConfirmation({
    clinicId,
    patientId: appointment.patient.id,
    appointmentId,
    patientName: appointment.patient.name,
    patientEmail: appointment.patient.email,
    patientPhone: appointment.patient.phone,
    consentWhatsApp: appointment.patient.consentWhatsApp,
    consentEmail: appointment.patient.consentEmail,
    professionalName: appointment.professionalProfile.user.name,
    scheduledAt: appointment.scheduledAt,
    modality: appointment.modality ?? "PRESENCIAL",
    clinicName: clinic.name,
  })
}
