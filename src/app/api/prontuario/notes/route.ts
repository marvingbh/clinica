import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertPatientInClinic, assertAppointmentInClinic } from "@/lib/clinic/ownership"
import { createNoteSchema } from "../_schemas"
import { ownershipErrorResponse } from "../_helpers"

/**
 * GET /api/prontuario/notes?patientId=...&professionalProfileId=&from=&to=&page=
 * Lists notes for a patient. Without broad READ access the result is forced to
 * the caller's own professional profile (agenda_own convention).
 */
export const GET = withFeatureAuth(
  { feature: "prontuario", minAccess: "READ" },
  async (req, { user, access }) => {
    const { searchParams } = new URL(req.url)
    const patientId = searchParams.get("patientId")
    if (!patientId) {
      return NextResponse.json({ error: "patientId é obrigatório." }, { status: 400 })
    }

    try {
      await assertPatientInClinic(user.clinicId, patientId)
    } catch (error) {
      const res = ownershipErrorResponse(error)
      if (res) return res
      throw error
    }

    // Self-scoping (agenda_own convention): an authoring professional (WRITE)
    // only ever lists their own notes. A read-only director (access === "READ")
    // or an admin without a professional profile may browse all professionals,
    // optionally narrowed by the professionalProfileId filter.
    const isDirector = access === "READ" || user.professionalProfileId === null
    const requestedProf = searchParams.get("professionalProfileId")
    const scopedProf = isDirector ? requestedProf : user.professionalProfileId

    const where: Prisma.ClinicalNoteWhereInput = {
      clinicId: user.clinicId,
      patientId,
    }
    if (scopedProf) where.professionalProfileId = scopedProf

    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (from || to) {
      where.sessionDate = {}
      if (from) where.sessionDate.gte = new Date(`${from}T00:00:00.000Z`)
      if (to) where.sessionDate.lte = new Date(`${to}T23:59:59.999Z`)
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = 50
    const notes = await prisma.clinicalNote.findMany({
      where,
      orderBy: { sessionDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        professionalProfile: { select: { user: { select: { name: true } } } },
        appointment: { select: { scheduledAt: true, status: true } },
        _count: { select: { addenda: true } },
      },
    })

    // Only the author may see section content of their own notes; for others
    // (directors), still return metadata + content since READ implies they can
    // read clinical content of this clinic. NONE viewers never reach here.
    return NextResponse.json({
      notes: notes.map((n) => ({
        id: n.id,
        patientId: n.patientId,
        professionalProfileId: n.professionalProfileId,
        professionalName: n.professionalProfile.user.name,
        appointmentId: n.appointmentId,
        noteType: n.noteType,
        format: n.format,
        status: n.status,
        sessionDate: n.sessionDate,
        signedAt: n.signedAt,
        appointmentScheduledAt: n.appointment?.scheduledAt ?? null,
        appointmentStatus: n.appointment?.status ?? null,
        addendaCount: n._count.addenda,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
      page,
    })
  }
)

/**
 * POST /api/prontuario/notes — create a draft note.
 */
export const POST = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }) => {
    if (!user.professionalProfileId) {
      return NextResponse.json(
        { error: "Apenas profissionais podem criar registros clínicos." },
        { status: 422 }
      )
    }

    const body = await req.json().catch(() => null)
    const parsed = createNoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }
    const { patientId, appointmentId, noteType, format, templateId } = parsed.data

    try {
      await assertPatientInClinic(user.clinicId, patientId)

      let sessionDate = parsed.data.sessionDate ? new Date(parsed.data.sessionDate) : new Date()
      if (appointmentId) {
        const appt = await assertAppointmentInClinic(user.clinicId, appointmentId)
        if (appt.type !== "CONSULTA") {
          return NextResponse.json(
            { error: "Só é possível registrar evolução para consultas." },
            { status: 422 }
          )
        }
        if (appt.patientId !== patientId) {
          return NextResponse.json(
            { error: "O paciente da sessão não corresponde ao registro." },
            { status: 422 }
          )
        }
        sessionDate = appt.scheduledAt
      }

      const note = await prisma.clinicalNote.create({
        data: {
          clinicId: user.clinicId,
          patientId,
          professionalProfileId: user.professionalProfileId,
          appointmentId: appointmentId ?? null,
          templateId: templateId ?? null,
          noteType: noteType ?? "EVOLUCAO",
          format: format ?? "SOAP",
          sessionDate,
          status: "RASCUNHO",
        },
      })

      await audit.log({
        user,
        action: AuditAction.CLINICAL_NOTE_CREATED,
        entityType: "ClinicalNote",
        entityId: note.id,
        newValues: { appointmentId: note.appointmentId, format: note.format, noteType: note.noteType },
        request: req,
      })

      return NextResponse.json({ note }, { status: 201 })
    } catch (error) {
      const res = ownershipErrorResponse(error)
      if (res) return res
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.clinicalNote.findFirst({
          where: {
            clinicId: user.clinicId,
            professionalProfileId: user.professionalProfileId,
            appointmentId: appointmentId ?? null,
          },
          select: { id: true },
        })
        return NextResponse.json(
          { error: "Já existe um registro para esta sessão.", existingNoteId: existing?.id },
          { status: 409 }
        )
      }
      throw error
    }
  }
)
