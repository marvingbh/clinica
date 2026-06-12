import React from "react"
import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertPatientInClinic } from "@/lib/clinic/ownership"
import { canDispose, clampRetentionYears, buildTermoDescarteData } from "@/lib/prontuario"
import { TermoDescarteDocument } from "@/lib/prontuario/termo-descarte-pdf"
import { ownershipErrorResponse } from "../../../_helpers"

/**
 * POST /api/prontuario/record/[patientId]/descarte
 * Formal disposal (Lei 13.787/2018): ADMIN only, after the retention deadline.
 * Snapshots counts/hashes, deletes notes+addenda, records the disposal, and
 * returns the disposal-term PDF.
 */
export const POST = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req, { user }, params) => {
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Apenas administradores podem realizar o descarte." },
        { status: 403 }
      )
    }

    try {
      await assertPatientInClinic(user.clinicId, params.patientId)
    } catch (error) {
      const res = ownershipErrorResponse(error)
      if (res) return res
      throw error
    }

    const [patient, clinic, signer] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: params.patientId, clinicId: user.clinicId },
        select: { name: true, recordClosedAt: true },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { name: true, prontuarioRetentionYears: true },
      }),
      prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
    ])

    const retentionYears = clampRetentionYears(clinic?.prontuarioRetentionYears ?? 5)
    const now = new Date()
    const check = canDispose(patient?.recordClosedAt ?? null, retentionYears, now)
    if (!check.ok) {
      return NextResponse.json(
        { error: "O prazo legal de guarda ainda não foi cumprido." },
        { status: 422 }
      )
    }

    const notes = await prisma.clinicalNote.findMany({
      where: { clinicId: user.clinicId, patientId: params.patientId },
      select: { id: true, contentHash: true, sessionDate: true, _count: { select: { addenda: true } } },
    })
    const addendaCount = notes.reduce((sum, n) => sum + n._count.addenda, 0)
    const sessionDates = notes.map((n) => n.sessionDate).sort((a, b) => a.getTime() - b.getTime())
    const contentHashes = notes
      .map((n) => n.contentHash)
      .filter((h): h is string => h !== null)

    const termoData = buildTermoDescarteData({
      clinicName: clinic?.name ?? "Clínica",
      patientName: patient?.name ?? "Paciente",
      recordClosedAt: patient!.recordClosedAt!,
      retentionYears,
      disposedAt: now,
      disposedByName: signer?.name ?? "Administrador",
      notesCount: notes.length,
      addendaCount,
      oldestSessionDate: sessionDates[0] ?? null,
      newestSessionDate: sessionDates[sessionDates.length - 1] ?? null,
      contentHashes,
    })

    await prisma.$transaction(async (tx) => {
      await tx.recordDisposal.create({
        data: {
          clinicId: user.clinicId,
          patientId: params.patientId,
          patientName: termoData.patientName,
          disposedByUserId: user.id,
          recordClosedAt: termoData.recordClosedAt,
          retentionYears,
          notesCount: termoData.notesCount,
          addendaCount: termoData.addendaCount,
          oldestSessionDate: termoData.oldestSessionDate,
          newestSessionDate: termoData.newestSessionDate,
          contentHashes,
        },
      })
      await tx.noteAddendum.deleteMany({
        where: { clinicId: user.clinicId, note: { patientId: params.patientId } },
      })
      await tx.clinicalNote.deleteMany({
        where: { clinicId: user.clinicId, patientId: params.patientId },
      })
    })

    await audit.log({
      user,
      action: AuditAction.PATIENT_RECORD_DISPOSED,
      entityType: "Patient",
      entityId: params.patientId,
      newValues: { notesCount: termoData.notesCount, addendaCount: termoData.addendaCount },
      request: req,
    })

    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(TermoDescarteDocument, { data: termoData }) as any
    )
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="termo-de-descarte.pdf"`,
      },
    })
  }
)
