import { prisma } from "@/lib/prisma"

export interface PatientPhoneEntry {
  phone: string
  label: string | null // null for the primary number
}

/**
 * Returns all phone numbers for a patient: the primary phone + any additional phones.
 * Used by notification code paths to send to all registered numbers.
 */
export async function getPatientPhoneNumbers(
  patientId: string,
  clinicId: string
): Promise<PatientPhoneEntry[]> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: {
      phone: true,
      additionalPhones: {
        select: { phone: true, label: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!patient) return []

  const phones: PatientPhoneEntry[] = [
    { phone: patient.phone, label: null },
  ]

  for (const additional of patient.additionalPhones) {
    phones.push({ phone: additional.phone, label: additional.label })
  }

  return phones
}
