import { prisma } from "@/lib/prisma"
import { isReadOnly } from "@/lib/subscription"

export interface LoadedBookingClinic {
  id: string
  name: string
  phone: string | null
  hasLogo: boolean
  settings: {
    enabled: boolean
    mode: "AUTO_CONFIRM" | "APPROVAL_REQUIRED"
    sessionDurationMinutes: number
    minAdvanceHours: number
    horizonDays: number
    allowedModalities: ("ONLINE" | "PRESENCIAL")[]
    maxOpenBookingsPerPhone: number
    blockedPhones: string[]
  }
}

export type LoadClinicResult =
  | { kind: "not_found" }
  | { kind: "closed"; clinicPhone: string | null }
  | { kind: "open"; clinic: LoadedBookingClinic }

/**
 * Loads a clinic by public slug for the booking flow and classifies whether
 * the public page is open. A clinic is "closed" when it is inactive, the
 * feature is disabled, no settings row exists, or the subscription is
 * read-only (trial expired / cancelled / unpaid).
 */
export async function loadBookingClinic(slug: string): Promise<LoadClinicResult> {
  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      logoData: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      onlineBookingSettings: {
        select: {
          enabled: true,
          mode: true,
          sessionDurationMinutes: true,
          minAdvanceHours: true,
          horizonDays: true,
          allowedModalities: true,
          maxOpenBookingsPerPhone: true,
          blockedPhones: true,
        },
      },
    },
  })

  if (!clinic || !clinic.isActive) return { kind: "not_found" }

  const settings = clinic.onlineBookingSettings
  const readOnly = isReadOnly({
    subscriptionStatus: clinic.subscriptionStatus,
    trialEndsAt: clinic.trialEndsAt,
  })

  if (!settings || !settings.enabled || readOnly) {
    return { kind: "closed", clinicPhone: clinic.phone }
  }

  return {
    kind: "open",
    clinic: {
      id: clinic.id,
      name: clinic.name,
      phone: clinic.phone,
      hasLogo: !!clinic.logoData,
      settings,
    },
  }
}
