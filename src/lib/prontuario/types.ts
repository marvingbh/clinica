/**
 * Pure types for the prontuário (clinical records) domain.
 *
 * Prisma enums are referenced as string-literal unions here so the module
 * stays free of framework/Prisma runtime dependencies (only `type` imports).
 */

export type ClinicalNoteType = "EVOLUCAO" | "AVALIACAO" | "ENCERRAMENTO" | "OUTRO"
export type ClinicalNoteFormat = "SOAP" | "DAP" | "LIVRE"
export type ClinicalNoteStatus = "RASCUNHO" | "ASSINADA"
export type FeatureAccess = "NONE" | "READ" | "WRITE"

/** Map of sectionId -> free text. */
export type NoteSections = Record<string, string>

/** Definition of a single editable section in a template. */
export interface SectionDef {
  id: string
  label: string
  helpText?: string
}

/** Maximum characters allowed per section. */
export const MAX_SECTION_LENGTH = 20_000

/** Context for deciding whether a viewer may read/write a note. */
export interface NoteAccessContext {
  viewerUserId: string
  viewerProfessionalProfileId: string | null
  viewerProntuarioAccess: FeatureAccess
  noteAuthorProfessionalProfileId: string
  noteAuthorIsActive: boolean
  clinicResponsibleProfessionalId: string | null
  noteStatus: ClinicalNoteStatus
}

/** Result of an access decision. */
export type NoteAccessDecision =
  | { allowed: false }
  | { allowed: true; mode: "AUTHOR" | "DIRECTOR_READ" | "RESPONSIBLE_READ"; auditRead: boolean }

/** Appointment shape used by the pending-notes computation. */
export interface PendingAppointment {
  id: string
  patientId: string | null
  patientName: string | null
  scheduledAt: Date
  status: string
  type: string
  professionalProfileId: string
  attendingProfessionalId: string | null
}
