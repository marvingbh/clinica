import type { ClinicalNoteFormat } from "./types"

export interface GroupMemberAppointment {
  appointmentId: string
  patientId: string
  scheduledAt: Date
}

export interface GroupDraftBase {
  clinicId: string
  professionalProfileId: string
  format: ClinicalNoteFormat
  templateId: string | null
}

export interface GroupDraftCreateInput {
  clinicId: string
  patientId: string
  professionalProfileId: string
  appointmentId: string
  templateId: string | null
  format: ClinicalNoteFormat
  sessionDate: Date
}

export interface GroupDraftResult {
  drafts: GroupDraftCreateInput[]
  /** appointmentIds skipped because a note already exists. */
  skipped: string[]
}

/**
 * Build one draft-create input per group member appointment, skipping members
 * that already have a note (by appointment id). `sessionDate` mirrors the
 * member appointment's scheduledAt.
 */
export function buildGroupDraftInputs(
  members: GroupMemberAppointment[],
  existingNoteApptIds: Set<string>,
  base: GroupDraftBase
): GroupDraftResult {
  const drafts: GroupDraftCreateInput[] = []
  const skipped: string[] = []

  for (const member of members) {
    if (existingNoteApptIds.has(member.appointmentId)) {
      skipped.push(member.appointmentId)
      continue
    }
    drafts.push({
      clinicId: base.clinicId,
      patientId: member.patientId,
      professionalProfileId: base.professionalProfileId,
      appointmentId: member.appointmentId,
      templateId: base.templateId,
      format: base.format,
      sessionDate: member.scheduledAt,
    })
  }

  return { drafts, skipped }
}
