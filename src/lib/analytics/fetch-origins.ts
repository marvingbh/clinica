import { prisma } from "@/lib/prisma"
import type { ReportScope } from "./fetch-shared"
import { acquisitionReport, type AcquisitionReport, type NewPatientSlim } from "./acquisition"

/**
 * New patients (by createdAt) within the range, grouped by acquisition source.
 * Conversion = patient has ≥1 finalized CONSULTA. Own-scope filters by reference
 * professional so a professional only sees the patients they own.
 */
export async function fetchOrigins(scope: ReportScope): Promise<AcquisitionReport> {
  const { clinicId, professionalProfileId, range } = scope

  const patients = await prisma.patient.findMany({
    where: {
      clinicId,
      createdAt: { gte: range.start, lt: range.end },
      ...(professionalProfileId ? { referenceProfessionalId: professionalProfileId } : {}),
    },
    select: {
      createdAt: true,
      referralSource: true,
      appointments: {
        where: { type: "CONSULTA", status: "FINALIZADO" },
        take: 1,
        select: { id: true },
      },
    },
  })

  const slim: NewPatientSlim[] = patients.map((p) => ({
    createdAt: p.createdAt,
    referralSource: p.referralSource,
    converted: p.appointments.length > 0,
  }))

  return acquisitionReport(slim, range)
}
