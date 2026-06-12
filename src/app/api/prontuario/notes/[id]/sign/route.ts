import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import {
  validateSign,
  canonicalizeNoteContent,
  computeContentHash,
  type NoteSections,
} from "@/lib/prontuario"
import { resolveNoteAccess } from "../../../_helpers"

/**
 * POST /api/prontuario/notes/[id]/sign — sign a draft (makes it immutable).
 * Only the author may sign. Computes the content hash and atomically guards on
 * status RASCUNHO to avoid races with autosave.
 */
export const POST = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { note } = await resolveNoteAccess(user, params.id)
    if (!note) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })
    if (note.professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json({ error: "Apenas o autor pode assinar." }, { status: 403 })
    }

    const sections = (note.sections ?? {}) as NoteSections
    const check = validateSign(note.status, sections)
    if (!check.ok) {
      if (check.reason === "ALREADY_SIGNED") {
        return NextResponse.json(
          { error: "Notas assinadas não podem ser alteradas. Adicione um adendo.", code: "SIGNED" },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: "Preencha ao menos uma seção antes de assinar." },
        { status: 422 }
      )
    }

    const canonical = canonicalizeNoteContent({
      patientId: note.patientId,
      professionalProfileId: note.professionalProfileId,
      appointmentId: note.appointmentId,
      noteType: note.noteType,
      format: note.format,
      sessionDate: note.sessionDate.toISOString(),
      sections,
    })
    const contentHash = computeContentHash(canonical)
    const signedAt = new Date()

    const result = await prisma.clinicalNote.updateMany({
      where: {
        id: note.id,
        clinicId: user.clinicId,
        professionalProfileId: user.professionalProfileId!,
        status: "RASCUNHO",
      },
      data: { status: "ASSINADA", signedAt, signedByUserId: user.id, contentHash },
    })

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Esta nota já foi assinada.", code: "SIGNED" },
        { status: 409 }
      )
    }

    await audit.log({
      user,
      action: AuditAction.CLINICAL_NOTE_SIGNED,
      entityType: "ClinicalNote",
      entityId: note.id,
      newValues: { contentHash },
      request: req,
    })

    const signed = await prisma.clinicalNote.findUnique({ where: { id: note.id } })
    return NextResponse.json({ note: signed })
  }
)
