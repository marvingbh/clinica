import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { changesToPatientUpdate, type UpdateChange } from "@/lib/patient-portal"

const schema = z.object({
  action: z.enum(["resolve", "reject", "apply"]),
  resolutionNotes: z.string().trim().max(2000).optional(),
})

/**
 * PATCH /api/portal-requests/[id]
 * resolve | reject | apply (apply = write UPDATE_DATA changes into the Patient).
 * All tenant-scoped to user.clinicId.
 */
export const PATCH = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req, { user }, params) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const request = await prisma.portalRequest.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, type: true, status: true, patientId: true, payload: true },
    })
    if (!request) {
      return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 })
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Solicitação já tratada." }, { status: 409 })
    }

    const now = new Date()

    if (parsed.data.action === "apply") {
      if (request.type !== "UPDATE_DATA") {
        return NextResponse.json(
          { error: "Apenas solicitações de atualização de dados podem ser aplicadas." },
          { status: 400 },
        )
      }
      const payload = (request.payload ?? {}) as { changes?: UpdateChange[] }
      const update = changesToPatientUpdate(payload.changes)
      // Drop nulls for non-nullable scalar columns (name/phone must stay set).
      if (update.name == null) delete update.name
      if (update.phone == null) delete update.phone
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: "Nenhuma alteração aplicável." }, { status: 400 })
      }

      // Tenant guard: patient must belong to the same clinic.
      const applied = await prisma.patient.updateMany({
        where: { id: request.patientId, clinicId: user.clinicId },
        data: update as Prisma.PatientUpdateManyMutationInput,
      })
      if (applied.count === 0) {
        return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
      }

      await prisma.portalRequest.update({
        where: { id: request.id },
        data: {
          status: "RESOLVED",
          resolvedByUserId: user.id,
          resolvedAt: now,
          resolutionNotes: parsed.data.resolutionNotes ?? null,
        },
      })

      await prisma.auditLog.create({
        data: {
          clinicId: user.clinicId,
          userId: user.id,
          action: "PORTAL_REQUEST_APPLIED",
          entityType: "Patient",
          entityId: request.patientId,
          newValues: { fields: Object.keys(update), portalRequestId: request.id },
        },
      })

      return NextResponse.json({ ok: true, status: "RESOLVED" })
    }

    const status = parsed.data.action === "resolve" ? "RESOLVED" : "REJECTED"
    await prisma.portalRequest.update({
      where: { id: request.id },
      data: {
        status,
        resolvedByUserId: user.id,
        resolvedAt: now,
        resolutionNotes: parsed.data.resolutionNotes ?? null,
      },
    })

    return NextResponse.json({ ok: true, status })
  },
)
