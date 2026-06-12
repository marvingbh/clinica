import type {
  MergeContext,
  MergeContextAppointment,
  MergeContextClinic,
  MergeContextPatient,
  MergeContextProfessional,
  SessionRow,
} from "./types"

export interface BuildMergeContextInput {
  patient: MergeContextPatient
  professional: MergeContextProfessional | null
  clinic: MergeContextClinic
  appointment: MergeContextAppointment | null
  sessionRows: SessionRow[]
  manualFields: Record<string, string>
  generatedAt: Date
}

/**
 * Pure adapter: maps flat objects already fetched by the route into a
 * MergeContext. No Prisma here. The route is responsible for ensuring the
 * `patient` is the document target only — for group sessions, ONLY the target
 * patient's name and the session window are passed; other members never leak.
 */
export function buildMergeContext(input: BuildMergeContextInput): MergeContext {
  return {
    patient: input.patient,
    professional: input.professional,
    clinic: input.clinic,
    appointment: input.appointment,
    sessionRows: input.sessionRows,
    manualFields: input.manualFields ?? {},
    generatedAt: input.generatedAt,
  }
}
