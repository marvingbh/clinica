import type { ClinicalNoteType, ClinicalNoteFormat } from "@/lib/prontuario"

export interface NoteListItem {
  id: string
  patientId: string
  /** Present in the cross-patient browser; absent in the per-patient tab. */
  patientName?: string | null
  professionalProfileId: string
  professionalName: string
  appointmentId: string | null
  noteType: ClinicalNoteType
  format: ClinicalNoteFormat
  status: "RASCUNHO" | "ASSINADA"
  sessionDate: string
  signedAt: string | null
  appointmentScheduledAt: string | null
  appointmentStatus: string | null
  addendaCount: number
  createdAt: string
  updatedAt: string
}

export interface NoteAddendumItem {
  id: string
  content: string
  createdAt: string
  authorName: string | null
}

export interface NoteDetail {
  id: string
  patientId: string
  patientName: string | null
  professionalProfileId: string
  appointmentId: string | null
  templateId: string | null
  noteType: ClinicalNoteType
  format: ClinicalNoteFormat
  sections: Record<string, string>
  sessionDate: string
  status: "RASCUNHO" | "ASSINADA"
  signedAt: string | null
  signedByName: string | null
  appointmentScheduledAt: string | null
  appointmentStatus: string | null
  canWrite: boolean
  updatedAt: string
}

export interface NoteTemplateItem {
  id: string
  name: string
  format: ClinicalNoteFormat
  sectionDefs: { id: string; label: string; helpText?: string }[]
}
