import { hasAnyContent } from "./sections"
import type { ClinicalNoteStatus, NoteSections } from "./types"

/** Only RASCUNHO notes may be edited. */
export function canEditNote(status: ClinicalNoteStatus): boolean {
  return status === "RASCUNHO"
}

/** Only RASCUNHO notes may be deleted. */
export function canDeleteNote(status: ClinicalNoteStatus): boolean {
  return status === "RASCUNHO"
}

export type SignValidation =
  | { ok: true }
  | { ok: false; reason: "ALREADY_SIGNED" | "EMPTY_SECTIONS" }

/**
 * Validate whether a note can be signed: it must be a draft and have at least
 * one non-empty section.
 */
export function validateSign(
  status: ClinicalNoteStatus,
  sections: NoteSections
): SignValidation {
  if (status !== "RASCUNHO") return { ok: false, reason: "ALREADY_SIGNED" }
  if (!hasAnyContent(sections)) return { ok: false, reason: "EMPTY_SECTIONS" }
  return { ok: true }
}

/**
 * Optimistic-lock check: returns true when the client's known `updatedAt`
 * differs from the database value (zero-millisecond tolerance).
 */
export function isStaleUpdate(clientUpdatedAt: string, dbUpdatedAt: Date): boolean {
  return new Date(clientUpdatedAt).getTime() !== dbUpdatedAt.getTime()
}
