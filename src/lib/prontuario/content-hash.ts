import { createHash } from "node:crypto"
import type { NoteSections } from "./types"

export interface CanonicalNoteInput {
  patientId: string
  professionalProfileId: string
  appointmentId: string | null
  noteType: string
  format: string
  /** ISO 8601 string of the clinical session date. */
  sessionDate: string
  sections: NoteSections
}

/**
 * Produce a deterministic JSON string for a note's clinical content + metadata.
 * Object keys are ordered so reordering the input does not change the output.
 */
export function canonicalizeNoteContent(input: CanonicalNoteInput): string {
  const orderedSections: Record<string, string> = {}
  for (const key of Object.keys(input.sections).sort()) {
    orderedSections[key] = input.sections[key]
  }
  const canonical = {
    appointmentId: input.appointmentId,
    format: input.format,
    noteType: input.noteType,
    patientId: input.patientId,
    professionalProfileId: input.professionalProfileId,
    sections: orderedSections,
    sessionDate: input.sessionDate,
  }
  return JSON.stringify(canonical)
}

/** SHA-256 hex digest (64 chars) of a canonical content string. */
export function computeContentHash(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex")
}
