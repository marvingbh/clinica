import React from "react"
import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertPatientInClinic } from "@/lib/clinic/ownership"
import {
  buildNoteListWhere,
  buildRecordExportEntries,
  DEFAULT_TEMPLATES,
  validateSectionDefs,
  type RecordExportSourceNote,
} from "@/lib/prontuario"
import { RecordExportDocument } from "@/lib/prontuario/record-export-pdf"
import { NOTE_TYPE_LABELS, NOTE_FORMAT_LABELS } from "@/app/prontuario/components/labels"
import { ownershipErrorResponse } from "../../../_helpers"

function safeFilename(name: string | null): string {
  const base = (name ?? "prontuario")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return `prontuario-${base || "paciente"}.pdf`
}

/**
 * GET /api/prontuario/record/[patientId]/pdf — export the patient's signed
 * clinical record as a PDF (LGPD access right / handover). Author-vs-director
 * scoping mirrors the notes browser; only SIGNED notes are included (drafts are
 * not part of the official record). Audited; never exposes content to non-readers.
 * Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD narrows the session-date range.
 */
export const GET = withFeatureAuth(
  { feature: "prontuario", minAccess: "READ" },
  async (req, { user, access }, params) => {
    try {
      await assertPatientInClinic(user.clinicId, params.patientId)
    } catch (error) {
      const res = ownershipErrorResponse(error)
      if (res) return res
      throw error
    }

    const isDirector = access === "READ" || user.professionalProfileId === null
    const scopedProf = isDirector ? null : user.professionalProfileId

    const { searchParams } = new URL(req.url)
    const where = buildNoteListWhere({
      clinicId: user.clinicId,
      patientId: params.patientId,
      professionalProfileId: scopedProf,
      status: "ASSINADA",
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    })

    const [notes, patient, clinic, exporter] = await Promise.all([
      prisma.clinicalNote.findMany({
        where,
        orderBy: { sessionDate: "asc" },
        include: {
          signedBy: { select: { name: true } },
          addenda: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { name: true } } },
          },
        },
      }),
      prisma.patient.findFirst({ where: { id: params.patientId, clinicId: user.clinicId }, select: { name: true } }),
      prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
    ])

    if (notes.length === 0) {
      return NextResponse.json(
        { error: "Nenhum registro assinado para exportar neste período." },
        { status: 422 }
      )
    }

    const templateIds = [...new Set(notes.map((n) => n.templateId).filter((id): id is string => !!id))]
    const templates = templateIds.length
      ? await prisma.noteTemplate.findMany({
          where: { clinicId: user.clinicId, id: { in: templateIds } },
          select: { id: true, sectionDefs: true },
        })
      : []
    const defsByTemplate = new Map(templates.map((t) => [t.id, validateSectionDefs(t.sectionDefs)]))
    const defsFor = (templateId: string | null, format: string) => {
      if (templateId && defsByTemplate.has(templateId)) return defsByTemplate.get(templateId)!
      const fb = DEFAULT_TEMPLATES.find((t) => t.format === format) ?? DEFAULT_TEMPLATES[0]
      return fb.sectionDefs
    }

    const sourceNotes: RecordExportSourceNote[] = notes.map((n) => ({
      sessionDate: n.sessionDate,
      noteType: n.noteType,
      format: n.format,
      signedByName: n.signedBy?.name ?? null,
      signedAt: n.signedAt,
      contentHash: n.contentHash,
      sections: (n.sections ?? {}) as Record<string, string>,
      sectionDefs: defsFor(n.templateId, n.format),
      addenda: n.addenda.map((a) => ({
        createdAt: a.createdAt,
        authorName: a.author?.name ?? null,
        content: a.content,
      })),
    }))

    const entries = buildRecordExportEntries(sourceNotes, {
      type: NOTE_TYPE_LABELS,
      format: NOTE_FORMAT_LABELS,
    })

    await audit.log({
      user,
      action: AuditAction.PATIENT_RECORD_EXPORTED,
      entityType: "Patient",
      entityId: params.patientId,
      newValues: {
        notesCount: entries.length,
        from: searchParams.get("from") ?? null,
        to: searchParams.get("to") ?? null,
        scope: isDirector ? "all" : "own",
      },
      request: req,
    })

    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(RecordExportDocument, {
        clinicName: clinic?.name ?? "Clínica",
        patientName: patient?.name ?? "Paciente",
        generatedAt: new Date(),
        generatedByName: exporter?.name ?? null,
        entries,
      }) as any
    )

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(patient?.name ?? null)}"`,
      },
    })
  }
)
