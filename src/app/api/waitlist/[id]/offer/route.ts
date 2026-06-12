import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { checkConflict, formatConflictError } from "@/lib/appointments"
import { manualOfferSchema, createAndSendOffer, resolveWaitlistSettings } from "@/lib/waitlist"
import { professionalBelongsToClinic } from "@/lib/clinic/ownership"
import type { OpenSlot } from "@/lib/waitlist"

/**
 * POST /api/waitlist/[id]/offer — manually send an offer for a slot (works
 * even in triage mode). Validates ownership and that the slot is still free.
 */
export const POST = withFeatureAuth(
  { feature: "waitlist", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const entry = await prisma.waitlistEntry.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, status: true, patientId: true },
    })
    if (!entry) {
      return NextResponse.json({ error: "Entrada nao encontrada" }, { status: 404 })
    }
    if (!entry.patientId) {
      return NextResponse.json(
        { error: "Leads não recebem oferta automática. Entre em contato manualmente." },
        { status: 400 }
      )
    }
    if (entry.status === "OFERTADA") {
      return NextResponse.json(
        { error: "Esta entrada já possui uma oferta em aberto" },
        { status: 409 }
      )
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
    }
    const parsed = manualOfferSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 })
    }
    const data = parsed.data

    if (!(await professionalBelongsToClinic(data.professionalProfileId, user.clinicId))) {
      return NextResponse.json({ error: "Profissional nao encontrado" }, { status: 404 })
    }

    const scheduledAt = new Date(data.slotStart)
    const endAt = new Date(data.slotEnd)

    // The slot must still be free.
    const conflict = await checkConflict({
      professionalProfileId: data.professionalProfileId,
      scheduledAt,
      endAt,
    })
    if (conflict.hasConflict && conflict.conflictingAppointment) {
      return NextResponse.json(formatConflictError(conflict.conflictingAppointment), {
        status: 409,
      })
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { name: true, timezone: true, waitlistSettings: true },
    })
    const settings = resolveWaitlistSettings(clinic?.waitlistSettings)
    const timezone = clinic?.timezone || "America/Sao_Paulo"

    const patient = await prisma.patient.findFirst({
      where: { id: entry.patientId, clinicId: user.clinicId },
      select: { id: true, name: true, email: true, consentWhatsApp: true, consentEmail: true },
    })
    if (!patient) {
      return NextResponse.json({ error: "Paciente nao encontrado" }, { status: 404 })
    }

    const professional = await prisma.professionalProfile.findUnique({
      where: { id: data.professionalProfileId },
      select: { user: { select: { name: true } } },
    })

    const slot: OpenSlot = {
      professionalProfileId: data.professionalProfileId,
      scheduledAt,
      endAt,
      modality: data.modality ?? null,
      sourceAppointmentId: null,
    }

    const offerId = await createAndSendOffer({
      clinicId: user.clinicId,
      clinicName: clinic?.name ?? "Clínica",
      entryId: entry.id,
      slot,
      patient,
      professionalName: professional?.user.name ?? "profissional",
      now: new Date(),
      holdHours: settings.holdHours,
      timezone,
      strategy: "MANUAL",
      userId: user.id,
    })

    if (!offerId) {
      return NextResponse.json(
        { error: "Paciente sem consentimento para receber a oferta" },
        { status: 400 }
      )
    }

    return NextResponse.json({ offerId }, { status: 201 })
  }
)
