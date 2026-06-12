import type { FeatureAccess, NoteAccessContext, NoteAccessDecision } from "./types"

const LEVELS: Record<FeatureAccess, number> = { NONE: 0, READ: 1, WRITE: 2 }

function meets(actual: FeatureAccess, required: FeatureAccess): boolean {
  return LEVELS[actual] >= LEVELS[required]
}

/**
 * Decide whether a viewer may read a clinical note (professional secrecy).
 *
 * - AUTHOR: viewer is the note's author — always allowed, never audited.
 * - DIRECTOR_READ: viewer has prontuario >= READ and is not the author — audited.
 * - RESPONSIBLE_READ: the author is inactive and the viewer is the clinic's
 *   designated responsible professional — audited.
 * - Otherwise: denied.
 */
export function decideNoteAccess(ctx: NoteAccessContext): NoteAccessDecision {
  const isAuthor =
    ctx.viewerProfessionalProfileId !== null &&
    ctx.viewerProfessionalProfileId === ctx.noteAuthorProfessionalProfileId

  if (isAuthor) {
    return { allowed: true, mode: "AUTHOR", auditRead: false }
  }

  if (meets(ctx.viewerProntuarioAccess, "READ")) {
    return { allowed: true, mode: "DIRECTOR_READ", auditRead: true }
  }

  if (
    !ctx.noteAuthorIsActive &&
    ctx.clinicResponsibleProfessionalId !== null &&
    ctx.viewerProfessionalProfileId === ctx.clinicResponsibleProfessionalId
  ) {
    return { allowed: true, mode: "RESPONSIBLE_READ", auditRead: true }
  }

  return { allowed: false }
}

/**
 * Whether the viewer may write (edit/delete a draft, sign, or add an addendum).
 * Writing is exclusive to the author and requires prontuario >= WRITE.
 * Editing a draft requires status RASCUNHO; addenda require status ASSINADA —
 * that status check is enforced separately by the immutability helpers, so this
 * function only enforces author + access level.
 */
export function canWriteNote(ctx: NoteAccessContext): boolean {
  const isAuthor =
    ctx.viewerProfessionalProfileId !== null &&
    ctx.viewerProfessionalProfileId === ctx.noteAuthorProfessionalProfileId
  return isAuthor && meets(ctx.viewerProntuarioAccess, "WRITE")
}
