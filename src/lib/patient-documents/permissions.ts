/**
 * Pure visibility / edit / delete rules for patient documents.
 *
 * Documents ride on the existing `patients` RBAC feature (READ = list/download,
 * WRITE = attach/edit/remove). These functions encode the *finer* rules layered
 * on top: the optional EXAME-restriction and the source-based immutability.
 */

import {
  CATEGORY_VALUES,
  type PatientDocumentCategoryString,
  type PatientDocumentSourceString,
} from "./types"

export interface DocumentViewer {
  /** null for users without a professional profile (e.g. a secretary). */
  professionalProfileId: string | null
}

export interface DocumentMeta {
  source: PatientDocumentSourceString
  category: PatientDocumentCategoryString | string
  deletedAt: Date | string | null
}

export interface DocumentSettings {
  restrictExamesToProfessionals: boolean
}

/**
 * A document is hidden ONLY when: the clinic restricts EXAME to professionals,
 * the document is in the EXAME category, and the viewer has no professional
 * profile. Every other case is visible.
 */
export function canViewDocument(
  viewer: DocumentViewer,
  doc: DocumentMeta,
  settings: DocumentSettings
): boolean {
  if (
    settings.restrictExamesToProfessionals &&
    doc.category === "EXAME" &&
    viewer.professionalProfileId === null
  ) {
    return false
  }
  return true
}

/** System-generated documents (non-UPLOAD) have immutable metadata. */
export function canEditDocument(doc: DocumentMeta): boolean {
  return doc.source === "UPLOAD" && !doc.deletedAt
}

/**
 * Only manual uploads can be deleted; system artifacts are subject to clinical
 * retention (Fluxo E.4). Already-deleted documents cannot be deleted again.
 */
export function canDeleteDocument(doc: DocumentMeta): boolean {
  return doc.source === "UPLOAD" && !doc.deletedAt
}

/**
 * Categories the viewer is allowed to see, used to build the list WHERE clause.
 * Drops EXAME for non-professionals when the clinic restriction is on.
 */
export function visibleCategoriesFor(
  viewer: DocumentViewer,
  settings: DocumentSettings
): PatientDocumentCategoryString[] {
  if (
    settings.restrictExamesToProfessionals &&
    viewer.professionalProfileId === null
  ) {
    return CATEGORY_VALUES.filter((c) => c !== "EXAME")
  }
  return [...CATEGORY_VALUES]
}
