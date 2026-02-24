import { prisma } from "@/lib/prisma"

export interface PatientPhoneEntry {
  phone: string
  label: string | null // null for the primary number
}

/**
 * Returns phone numbers for a patient: the primary phone + additional phones.
 * By default, only returns additional phones with notify=true (for notification paths).
 * Pass notifyOnly=false to get all phones regardless (e.g., for display purposes).
 */
export async function getPatientPhoneNumbers(
  patientId: string,
  clinicId: string,
  { notifyOnly = true }: { notifyOnly?: boolean } = {}
): Promise<PatientPhoneEntry[]> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: {
      phone: true,
      additionalPhones: {
        where: notifyOnly ? { notify: true } : undefined,
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
