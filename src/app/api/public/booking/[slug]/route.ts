import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { normalizePhone } from "@/lib/phone"
import { publicBookingSchema, isHoneypotTripped } from "@/lib/booking"
import { loadBookingClinic } from "../_lib/load-clinic"
import { listBookableProfessionals } from "../_lib/list-professionals"
import { submitBooking } from "../_lib/submit-booking"
import {
  notifyStaffBookingReceived,
  notifyPatientConfirmation,
} from "../_lib/notify-booking"

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

const CLOSED_BODY = {
  closed: true as const,
  error: "O agendamento online desta clínica está temporariamente indisponível.",
}

/**
 * GET /api/public/booking/[slug] — clinic info + listable professionals.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const rate = await checkRateLimit(`booking-info:${clientIp(req)}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const { slug } = await params
  const loaded = await loadBookingClinic(slug)
  if (loaded.kind === "not_found") {
    return NextResponse.json({ error: "Clínica não encontrada" }, { status: 404 })
  }
  if (loaded.kind === "closed") {
    return NextResponse.json({ ...CLOSED_BODY, clinicPhone: loaded.clinicPhone }, { status: 200 })
  }

  const professionals = await listBookableProfessionals(loaded.clinic.id)
  return NextResponse.json({
    clinic: {
      name: loaded.clinic.name,
      hasLogo: loaded.clinic.hasLogo,
      phone: loaded.clinic.phone,
    },
    settings: {
      mode: loaded.clinic.settings.mode,
      allowedModalities: loaded.clinic.settings.allowedModalities,
    },
    professionals,
  })
}

/**
 * POST /api/public/booking/[slug] — submit a self-booking.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip = clientIp(req)
  const ipRate = await checkRateLimit(`booking-submit:${ip}`, RATE_LIMIT_CONFIGS.bookingSubmit)
  if (!ipRate.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const { slug } = await params
  const body = await req.json().catch(() => null)
  const parsed = publicBookingSchema.safeParse(body)

  // Honeypot or invalid payload → respond generically without persisting.
  if (!parsed.success) {
    if (body && isHoneypotTripped(body)) {
      return NextResponse.json({ status: "pending" }, { status: 201 })
    }
    return NextResponse.json(
      { error: parsed.success ? "" : parsed.error.issues[0].message },
      { status: 400 }
    )
  }
  if (isHoneypotTripped(parsed.data)) {
    return NextResponse.json({ status: "pending" }, { status: 201 })
  }

  const phoneRate = await checkRateLimit(
    `booking-phone:${normalizePhone(parsed.data.phone)}`,
    RATE_LIMIT_CONFIGS.bookingPhone
  )
  if (!phoneRate.allowed) {
    return NextResponse.json(
      { error: "Você já possui agendamentos aguardando confirmação. Aguarde o retorno da clínica." },
      { status: 429 }
    )
  }

  const outcome = await submitBooking(slug, parsed.data, ip)

  switch (outcome.kind) {
    case "not_found":
      return NextResponse.json({ error: "Clínica não encontrada" }, { status: 404 })
    case "closed":
      return NextResponse.json({ error: "Agendamento online indisponível." }, { status: 403 })
    case "invalid_slot":
      return NextResponse.json(
        { error: "Ops! Esse horário acabou de ser preenchido. Escolha outro horário." },
        { status: 409 }
      )
    case "limit_reached":
      return NextResponse.json(
        { error: "Você já possui agendamentos aguardando confirmação. Aguarde o retorno da clínica." },
        { status: 422 }
      )
    case "blocked":
      return NextResponse.json({ status: "pending" }, { status: 201 })
    case "conflict":
      return NextResponse.json(
        {
          error: "Ops! Esse horário acabou de ser preenchido. Escolha outro horário.",
          refreshedDays: outcome.refreshedDays,
        },
        { status: 409 }
      )
    case "confirmed":
      // Best-effort notifications; failures must not fail the response.
      try {
        await notifyPatientConfirmation({
          clinicId: outcome.clinic.id,
          patientId: outcome.patientId,
          appointmentId: outcome.appointmentId,
          patientName: outcome.patientName,
          patientEmail: outcome.patientEmail,
          patientPhone: outcome.patientPhone,
          consentWhatsApp: outcome.consentWhatsApp,
          consentEmail: outcome.consentEmail,
          professionalName: outcome.professionalName,
          scheduledAt: outcome.scheduledAt,
          modality: outcome.modality,
          clinicName: outcome.clinic.name,
        })
        await notifyStaffBookingReceived({
          clinicId: outcome.clinic.id,
          clinicName: outcome.clinic.name,
          professionalProfileId: outcome.professionalProfileId,
          contactName: outcome.patientName,
          contactPhone: outcome.patientPhone ?? "",
          professionalName: outcome.professionalName,
          scheduledAt: outcome.scheduledAt,
          modality: outcome.modality,
        })
      } catch (err) {
        console.error("Booking confirmation notifications failed:", err)
      }
      return NextResponse.json({ status: "confirmed" }, { status: 201 })
    case "pending":
      try {
        await notifyStaffBookingReceived({
          clinicId: outcome.clinic.id,
          clinicName: outcome.clinic.name,
          professionalProfileId: outcome.professionalProfileId,
          contactName: outcome.contactName,
          contactPhone: outcome.contactPhone,
          professionalName: outcome.professionalName,
          scheduledAt: outcome.scheduledAt,
          modality: outcome.modality,
        })
        await createApprovalTodo(outcome)
      } catch (err) {
        console.error("Booking pending notifications failed:", err)
      }
      return NextResponse.json({ status: "pending" }, { status: 201 })
  }
}

async function createApprovalTodo(outcome: {
  clinic: { id: string }
  professionalProfileId: string
  contactName: string
  scheduledAt: Date
}): Promise<void> {
  const { prisma } = await import("@/lib/prisma")
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  const label = outcome.scheduledAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
  await prisma.todo.create({
    data: {
      clinicId: outcome.clinic.id,
      professionalProfileId: outcome.professionalProfileId,
      title: `Aprovar agendamento online: ${outcome.contactName} — ${label}`,
      day,
    },
  })
}
