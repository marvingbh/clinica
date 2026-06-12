import { prisma } from "@/lib/prisma"
import { classifyPhoneMatch, type PhoneMatch } from "@/lib/booking"

/**
 * Counts a phone's open bookings for a clinic: PENDING requests with a future
 * slot, plus APPROVED requests whose appointment is in the future and not
 * cancelled. Persisted source of truth for the per-phone limit (instance-safe).
 */
export async function countOpenBookings(
  clinicId: string,
  phone: string,
  now: Date
): Promise<number> {
  const [pending, approved] = await Promise.all([
    prisma.bookingRequest.count({
      where: { clinicId, phone, status: "PENDING", scheduledAt: { gte: now } },
    }),
    prisma.bookingRequest.count({
      where: {
        clinicId,
        phone,
        status: "APPROVED",
        appointment: {
          scheduledAt: { gte: now },
          status: { notIn: ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"] },
        },
      },
    }),
  ])
  return pending + approved
}

/**
 * Classifies a phone against a clinic's patients: distinct patient ids found in
 * Patient.phone ∪ PatientPhone.phone, fed into the pure classifier.
 */
export async function lookupPhoneMatch(clinicId: string, phone: string): Promise<PhoneMatch> {
  const [patientsByPhone, additionalPhones] = await Promise.all([
    prisma.patient.findMany({ where: { clinicId, phone }, select: { id: true } }),
    prisma.patientPhone.findMany({ where: { clinicId, phone }, select: { patientId: true } }),
  ])
  return classifyPhoneMatch([
    ...patientsByPhone.map((p) => p.id),
    ...additionalPhones.map((p) => p.patientId),
  ])
}
