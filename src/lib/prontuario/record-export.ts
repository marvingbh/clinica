import type { ClinicalNoteType, ClinicalNoteFormat, SectionDef } from "./types"

export interface RecordExportSourceNote {
  sessionDate: Date | string
  noteType: ClinicalNoteType
  format: ClinicalNoteFormat
  signedByName: string | null
  signedAt: Date | string | null
  contentHash: string | null
  sections: Record<string, string>
  /** Template section definitions, in display order, used to label sections. */
  sectionDefs: Pick<SectionDef, "id" | "label">[]
  addenda: { createdAt: Date | string; authorName: string | null; content: string }[]
}

export interface RecordExportSection {
  label: string
  text: string
}

export interface RecordExportEntry {
  sessionDate: Date | string
  typeLabel: string
  formatLabel: string
  signedByName: string | null
  signedAt: Date | string | null
  contentHash: string | null
  sections: RecordExportSection[]
  addenda: { createdAt: Date | string; authorName: string | null; content: string }[]
}

export interface RecordExportLabels {
  type: Record<string, string>
  format: Record<string, string>
}

/**
 * Build the ordered, label-resolved entries for a patient's prontuário export.
 * Notes are ordered chronologically (oldest first); within each note, sections
 * follow the template order and empty sections are dropped. Pure — the pt-BR
 * type/format labels are injected so this stays free of UI dependencies.
 */
export function buildRecordExportEntries(
  notes: RecordExportSourceNote[],
  labels: RecordExportLabels
): RecordExportEntry[] {
  return [...notes]
    .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
    .map((n) => ({
      sessionDate: n.sessionDate,
      typeLabel: labels.type[n.noteType] ?? n.noteType,
      formatLabel: labels.format[n.format] ?? n.format,
      signedByName: n.signedByName,
      signedAt: n.signedAt,
      contentHash: n.contentHash,
      sections: n.sectionDefs
        .map((d) => ({ label: d.label, text: (n.sections[d.id] ?? "").trim() }))
        .filter((s) => s.text.length > 0),
      addenda: n.addenda,
    }))
}
