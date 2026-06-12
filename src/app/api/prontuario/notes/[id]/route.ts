import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import {
  canWriteNote,
  hasAnyContent,
  isStaleUpdate,
  mergeSectionUpdate,
  type NoteSections,
} from "@/lib/prontuario"
import { updateNoteSchema } from "../../_schemas"
import { resolveNoteAccess, resolveSectionDefs, buildNoteDetail } from "../../_helpers"

/** GET /api/prontuario/notes/[id] */
export const GET = withFeatureAuth(
  { feature: "prontuario", minAccess: "READ" },
  async (req, { user }, params) => {
    const { note, decision } = await resolveNoteAccess(user, params.id)
    if (!note) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "Você não tem permissão para acessar o prontuário." },
        { status: 403 }
      )
    }

    if (decision.auditRead) {
      await audit.log({
        user,
        action: AuditAction.CLINICAL_NOTE_ACCESSED,
        entityType: "ClinicalNote",
        entityId: note.id,
        newValues: { mode: decision.mode, professionalProfileId: note.professionalProfileId },
        request: req,
      })
    }

    const detail = await buildNoteDetail(user, note, decision.mode === "AUTHOR")
    return NextResponse.json(detail)
  }
)

/** PATCH /api/prontuario/notes/[id] — autosave / edit a draft. */
export const PATCH = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const body = await req.json().catch(() => null)
    const parsed = updateNoteSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

    const { note } = await resolveNoteAccess(user, params.id)
    if (!note) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })

    const writable = canWriteNote({
      viewerUserId: user.id,
      viewerProfessionalProfileId: user.professionalProfileId,
      viewerProntuarioAccess: user.permissions.prontuario,
      noteAuthorProfessionalProfileId: note.professionalProfileId,
      noteAuthorIsActive: true,
      clinicResponsibleProfessionalId: null,
      noteStatus: note.status,
    })
    if (!writable) {
      return NextResponse.json(
        { error: "Você não tem permissão para editar este registro." },
        { status: 403 }
      )
    }
    if (note.status === "ASSINADA") {
      return NextResponse.json(
        { error: "Notas assinadas não podem ser alteradas. Adicione um adendo.", code: "SIGNED" },
        { status: 409 }
      )
    }

    const currentSections = (note.sections ?? {}) as NoteSections
    const data: Prisma.ClinicalNoteUpdateInput = {}

    if (parsed.data.sections !== undefined) {
      const defs = await resolveSectionDefs(
        user.clinicId,
        parsed.data.templateId !== undefined ? parsed.data.templateId : note.templateId,
        parsed.data.format ?? note.format
      )
      data.sections = mergeSectionUpdate(currentSections, parsed.data.sections, defs)
    }
    if (parsed.data.noteType !== undefined) data.noteType = parsed.data.noteType
    if (parsed.data.sessionDate !== undefined) data.sessionDate = new Date(parsed.data.sessionDate)

    if (parsed.data.format !== undefined || parsed.data.templateId !== undefined) {
      if (hasAnyContent(currentSections)) {
        return NextResponse.json(
          { error: "O modelo só pode ser trocado enquanto a nota está vazia." },
          { status: 422 }
        )
      }
      if (parsed.data.format !== undefined) data.format = parsed.data.format
      if (parsed.data.templateId !== undefined) {
        data.template = parsed.data.templateId
          ? { connect: { id: parsed.data.templateId } }
          : { disconnect: true }
      }
    }

    const result = await prisma.clinicalNote.updateMany({
      where: {
        id: note.id,
        clinicId: user.clinicId,
        professionalProfileId: user.professionalProfileId!,
        status: "RASCUNHO",
        updatedAt: new Date(parsed.data.updatedAt),
      },
      data,
    })

    if (result.count === 0) {
      const fresh = await prisma.clinicalNote.findFirst({
        where: { id: note.id, clinicId: user.clinicId },
        select: { status: true, updatedAt: true },
      })
      if (fresh?.status === "ASSINADA") {
        return NextResponse.json(
          { error: "Notas assinadas não podem ser alteradas. Adicione um adendo.", code: "SIGNED" },
          { status: 409 }
        )
      }
      if (fresh && isStaleUpdate(parsed.data.updatedAt, fresh.updatedAt)) {
        return NextResponse.json(
          {
            error:
              "Esta nota foi alterada em outra aba ou dispositivo. Recarregue a página para continuar.",
            code: "STALE",
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: "Não foi possível salvar." }, { status: 409 })
    }

    const updated = await prisma.clinicalNote.findUnique({ where: { id: note.id } })
    await audit.log({
      user,
      action: AuditAction.CLINICAL_NOTE_UPDATED,
      entityType: "ClinicalNote",
      entityId: note.id,
      newValues: { format: updated?.format, noteType: updated?.noteType },
      request: req,
    })
    return NextResponse.json({ note: updated })
  }
)

/** DELETE /api/prontuario/notes/[id] — delete own draft. */
export const DELETE = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { note } = await resolveNoteAccess(user, params.id)
    if (!note) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })
    if (note.professionalProfileId !== user.professionalProfileId || note.status === "ASSINADA") {
      return NextResponse.json(
        { error: "Notas assinadas não podem ser excluídas." },
        { status: 403 }
      )
    }

    const result = await prisma.clinicalNote.deleteMany({
      where: {
        id: note.id,
        clinicId: user.clinicId,
        professionalProfileId: user.professionalProfileId!,
        status: "RASCUNHO",
      },
    })
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Notas assinadas não podem ser excluídas." },
        { status: 403 }
      )
    }

    await audit.log({
      user,
      action: AuditAction.CLINICAL_NOTE_DELETED,
      entityType: "ClinicalNote",
      entityId: note.id,
      request: req,
    })
    return NextResponse.json({ success: true })
  }
)
