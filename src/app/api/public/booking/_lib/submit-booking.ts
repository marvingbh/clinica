import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { normalizePhone } from "@/lib/phone"
import {
  isPhoneBlocked,
  exceedsOpenBookingLimit,
  utcToSpDateISO,
  type PublicBookingInput,
} from "@/lib/booking"
import { checkConflict } from "@/lib/appointments/conflict-check"
import { loadBookingClinic, type LoadedBookingClinic } from "./load-clinic"
import { computeProfessionalSlots } from "./slot-data"
import { effectiveDuration, effectiveHorizon } from "./resolve-duration"
import { countOpenBookings, lookupPhoneMatch } from "./lookup"

type SubmitOutcome =
  | { kind: "closed" }
  | { kind: "not_found" }
  | { kind: "invalid_slot" }
  | { kind: "limit_reached" }
  | { kind: "blocked" } // silent success — looks like pending to the visitor
  | { kind: "conflict"; refreshedDays: unknown }
  | {
      kind: "confirmed"
      clinic: LoadedBookingClinic
      bookingRequestId: string
      appointmentId: string
      patientId: string
      patientName: string
      patientEmail: string | null
      patientPhone: string | null
      consentWhatsApp: boolean
      consentEmail: boolean
      professionalName: string
      professionalProfileId: string
      scheduledAt: Date
      modality: string
    }
  | {
      kind: "pending"
      clinic: LoadedBookingClinic
      bookingRequestId: string
      professionalProfileId: string
      professionalName: string
      contactName: string
      contactPhone: string
      scheduledAt: Date
      modality: string
    }

interface ResolvedProfessional {
  id: string
  duration: number
  buffer: number
  horizon: number
  name: string
}

/**
 * Orchestrates a public booking submission end-to-end (excluding HTTP and the
 * fire-and-forget notifications). Returns a discriminated outcome the route
 * maps to a status code. All Prisma access is clinic-scoped.
 */
export async function submitBooking(
  slug: string,
  input: PublicBookingInput,
  ip: string | null
): Promise<SubmitOutcome> {
  const loaded = await loadBookingClinic(slug)
  if (loaded.kind === "not_found") return { kind: "not_found" }
  if (loaded.kind === "closed") return { kind: "closed" }
  const clinic = loaded.clinic

  // Modality must be allowed by the clinic.
  if (!clinic.settings.allowedModalities.includes(input.modality)) {
    return { kind: "invalid_slot" }
  }

  // Resolve the professional within this clinic.
  const profile = await prisma.professionalProfile.findFirst({
    where: {
      publicBookingSlug: input.professionalSlug,
      allowOnlineBooking: true,
      user: { clinicId: clinic.id, isActive: true },
    },
    select: {
      id: true,
      appointmentDuration: true,
      bufferBetweenSlots: true,
      maxAdvanceBookingDays: true,
      user: { select: { name: true } },
    },
  })
  if (!profile) return { kind: "not_found" }

  const prof: ResolvedProfessional = {
    id: profile.id,
    duration: effectiveDuration(profile.appointmentDuration, clinic.settings.sessionDurationMinutes),
    buffer: profile.bufferBetweenSlots,
    horizon: effectiveHorizon(clinic.settings.horizonDays, profile.maxAdvanceBookingDays),
    name: profile.user.name,
  }

  const normalizedPhone = normalizePhone(input.phone)
  const now = new Date()

  // Blocklist → silent generic success, persist nothing.
  if (isPhoneBlocked(clinic.settings.blockedPhones, normalizedPhone)) {
    return { kind: "blocked" }
  }

  // Open-booking limit per phone (persisted, instance-independent).
  const openCount = await countOpenBookings(clinic.id, normalizedPhone, now)
  if (exceedsOpenBookingLimit(openCount, clinic.settings.maxOpenBookingsPerPhone)) {
    return { kind: "limit_reached" }
  }

  // Anti-forgery: the submitted start must be an exact free candidate for the
  // professional on that day, recomputed server-side.
  const start = new Date(input.start)
  const fromISO = utcToSpDateISO(start)
  const days = await computeProfessionalSlots(
    {
      professionalProfileId: prof.id,
      clinicId: clinic.id,
      durationMinutes: prof.duration,
      bufferMinutes: prof.buffer,
      minAdvanceHours: clinic.settings.minAdvanceHours,
      horizonDays: prof.horizon,
    },
    fromISO,
    1,
    now
  )
  const candidate = days[0]?.slots.find((s) => s.start === start.toISOString())
  if (!candidate) return { kind: "invalid_slot" }
  const endAt = new Date(candidate.end)

  // Phone match → distinct patient ids from Patient.phone ∪ PatientPhone.phone.
  const match = await lookupPhoneMatch(clinic.id, normalizedPhone)
  const autoConfirm = clinic.settings.mode === "AUTO_CONFIRM" && match.kind === "unique"

  try {
    const result = await prisma.$transaction(async (tx) => {
      const conflict = await checkConflict(
        { professionalProfileId: prof.id, scheduledAt: start, endAt },
        tx
      )
      if (conflict.hasConflict) {
        throw new Error("CONFLICT")
      }

      const baseRequest = {
        clinicId: clinic.id,
        professionalProfileId: prof.id,
        scheduledAt: start,
        endAt,
        modality: input.modality,
        name: input.name,
        phone: normalizedPhone,
        email: input.email,
        cpf: input.cpf ? input.cpf.replace(/\D/g, "") : null,
        consentWhatsApp: true,
        consentEmail: true,
        consentAt: now,
        ipAddress: ip,
      }

      if (autoConfirm && match.kind === "unique") {
        const patient = await tx.patient.findFirst({
          where: { id: match.patientId, clinicId: clinic.id },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            sessionFee: true,
            consentWhatsApp: true,
            consentEmail: true,
          },
        })
        if (!patient) throw new Error("PATIENT_GONE")

        const appointment = await tx.appointment.create({
          data: {
            clinicId: clinic.id,
            professionalProfileId: prof.id,
            patientId: patient.id,
            type: "CONSULTA",
            status: "AGENDADO",
            blocksTime: true,
            scheduledAt: start,
            endAt,
            modality: input.modality,
            price: patient.sessionFee ?? null,
          },
          select: { id: true },
        })

        // Turn on consents that were newly granted (never turn off).
        const consentUpdate: Prisma.PatientUpdateInput = {}
        if (!patient.consentWhatsApp) {
          consentUpdate.consentWhatsApp = true
          consentUpdate.consentWhatsAppAt = now
        }
        if (!patient.consentEmail) {
          consentUpdate.consentEmail = true
          consentUpdate.consentEmailAt = now
        }
        if (Object.keys(consentUpdate).length > 0) {
          await tx.patient.update({ where: { id: patient.id }, data: consentUpdate })
        }

        const request = await tx.bookingRequest.create({
          data: {
            ...baseRequest,
            status: "APPROVED",
            patientId: patient.id,
            appointmentId: appointment.id,
            reviewedAt: now,
          },
          select: { id: true },
        })

        return {
          confirmed: true as const,
          requestId: request.id,
          appointmentId: appointment.id,
          patient,
        }
      }

      // Pending: APPROVAL_REQUIRED, or unknown/ambiguous contact.
      const request = await tx.bookingRequest.create({
        data: {
          ...baseRequest,
          status: "PENDING",
          patientId: match.kind === "unique" ? match.patientId : null,
        },
        select: { id: true },
      })
      return { confirmed: false as const, requestId: request.id }
    })

    if (result.confirmed) {
      return {
        kind: "confirmed",
        clinic,
        bookingRequestId: result.requestId,
        appointmentId: result.appointmentId,
        patientId: result.patient.id,
        patientName: result.patient.name,
        patientEmail: result.patient.email,
        patientPhone: result.patient.phone,
        consentWhatsApp: true,
        consentEmail: true,
        professionalName: prof.name,
        professionalProfileId: prof.id,
        scheduledAt: start,
        modality: input.modality,
      }
    }

    return {
      kind: "pending",
      clinic,
      bookingRequestId: result.requestId,
      professionalProfileId: prof.id,
      professionalName: prof.name,
      contactName: input.name,
      contactPhone: normalizedPhone,
      scheduledAt: start,
      modality: input.modality,
    }
  } catch (err) {
    if (err instanceof Error && err.message === "CONFLICT") {
      // Return a fresh grid so the UI can re-render available slots.
      const refreshed = await computeProfessionalSlots(
        {
          professionalProfileId: prof.id,
          clinicId: clinic.id,
          durationMinutes: prof.duration,
          bufferMinutes: prof.buffer,
          minAdvanceHours: clinic.settings.minAdvanceHours,
          horizonDays: prof.horizon,
        },
        fromISO,
        7,
        new Date()
      )
      return { kind: "conflict", refreshedDays: refreshed }
    }
    if (err instanceof Error && err.message === "PATIENT_GONE") {
      return { kind: "invalid_slot" }
    }
    throw err
  }
}
