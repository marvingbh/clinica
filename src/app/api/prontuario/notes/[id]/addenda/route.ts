import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { addendumSchema } from "../../../_schemas"
import { resolveNoteAccess } from "../../../_helpers"

/**
 * POST /api/prontuario/notes/[id]/addenda — add an addendum.
 * Only the author may add, and only to a signed note.
 */
export const POST = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json().catch(() => null)
    const parsed = addendumSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const { note } = await resolveNoteAccess(user, params.id)
    if (!note) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })
    if (note.professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json({ error: "Apenas o autor pode adicionar adendos." }, { status: 403 })
    }
    if (note.status !== "ASSINADA") {
      return NextResponse.json(
        { error: "Adendos só podem ser adicionados a notas assinadas." },
        { status: 422 }
      )
    }

    const addendum = await prisma.noteAddendum.create({
      data: {
        clinicId: user.clinicId,
        noteId: note.id,
        authorUserId: user.id,
        content: parsed.data.content,
      },
    })

    await audit.log({
      user,
      action: AuditAction.CLINICAL_NOTE_ADDENDUM_CREATED,
      entityType: "ClinicalNote",
      entityId: note.id,
      newValues: { addendumId: addendum.id },
      request: req,
    })

    return NextResponse.json(
      {
        addendum: { id: addendum.id, content: addendum.content, createdAt: addendum.createdAt },
      },
      { status: 201 }
    )
  }
)
