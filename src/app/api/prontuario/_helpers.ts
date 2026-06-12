import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OwnershipError } from "@/lib/clinic/ownership"
import {
  decideNoteAccess,
  validateSectionDefs,
  DEFAULT_TEMPLATES,
  type NoteAccessContext,
  type NoteAccessDecision,
  type SectionDef,
} from "@/lib/prontuario"
import type { AuthUser } from "@/lib/rbac"

/** Maps OwnershipError -> 404; rethrows anything else. */
export function ownershipErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof OwnershipError) {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })
  }
  return null
}

/**
 * Load a note scoped to the clinic, then build the access decision for the
 * current user (loading the author's active flag + clinic responsible only
 * when the viewer is not the author, to keep the happy path cheap).
 */
export async function resolveNoteAccess(
  user: AuthUser,
  noteId: string
): Promise<
  | { note: NoteRecord; decision: NoteAccessDecision }
  | { note: null; decision: null }
> {
  const note = await prisma.clinicalNote.findFirst({
    where: { id: noteId, clinicId: user.clinicId },
  })
  if (!note) return { note: null, decision: null }

  const isAuthor = note.professionalProfileId === user.professionalProfileId
  let noteAuthorIsActive = true
  let clinicResponsibleProfessionalId: string | null = null

  if (!isAuthor) {
    const [author, clinic] = await Promise.all([
      prisma.professionalProfile.findUnique({
        where: { id: note.professionalProfileId },
        select: { user: { select: { isActive: true } } },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { prontuarioResponsibleProfessionalId: true },
      }),
    ])
    noteAuthorIsActive = author?.user.isActive ?? true
    clinicResponsibleProfessionalId = clinic?.prontuarioResponsibleProfessionalId ?? null
  }

  const ctx: NoteAccessContext = {
    viewerUserId: user.id,
    viewerProfessionalProfileId: user.professionalProfileId,
    viewerProntuarioAccess: user.permissions.prontuario,
    noteAuthorProfessionalProfileId: note.professionalProfileId,
    noteAuthorIsActive,
    clinicResponsibleProfessionalId,
    noteStatus: note.status,
  }

  return { note, decision: decideNoteAccess(ctx) }
}

export type NoteRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.clinicalNote.findFirst>>
>

/**
 * Build the full note-detail payload (addenda, patient/author names, linked
 * appointment status). `isAuthor` controls whether the viewer may write.
 */
export async function buildNoteDetail(user: AuthUser, note: NoteRecord, isAuthor: boolean) {
  const [addenda, patient, signedBy] = await Promise.all([
    prisma.noteAddendum.findMany({
      where: { noteId: note.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true } } },
    }),
    prisma.patient.findFirst({ where: { id: note.patientId }, select: { name: true } }),
    note.signedByUserId
      ? prisma.user.findUnique({ where: { id: note.signedByUserId }, select: { name: true } })
      : Promise.resolve(null),
  ])
  const appointment = note.appointmentId
    ? await prisma.appointment.findFirst({
        where: { id: note.appointmentId, clinicId: user.clinicId },
        select: { scheduledAt: true, status: true },
      })
    : null

  return {
    note: {
      ...note,
      patientName: patient?.name ?? null,
      signedByName: signedBy?.name ?? null,
      appointmentScheduledAt: appointment?.scheduledAt ?? null,
      appointmentStatus: appointment?.status ?? null,
      canWrite: isAuthor && user.permissions.prontuario === "WRITE",
    },
    addenda: addenda.map((a) => ({
      id: a.id,
      content: a.content,
      createdAt: a.createdAt,
      authorName: a.author?.name ?? null,
    })),
  }
}

/**
 * Resolve the section definitions for a note, preferring its clinic template
 * and falling back to the matching default template by format.
 */
export async function resolveSectionDefs(
  clinicId: string,
  templateId: string | null,
  format: string
): Promise<SectionDef[]> {
  if (templateId) {
    const tpl = await prisma.noteTemplate.findFirst({
      where: { id: templateId, clinicId },
      select: { sectionDefs: true },
    })
    if (tpl) return validateSectionDefs(tpl.sectionDefs)
  }
  const fallback = DEFAULT_TEMPLATES.find((t) => t.format === format) ?? DEFAULT_TEMPLATES[0]
  return fallback.sectionDefs
}
