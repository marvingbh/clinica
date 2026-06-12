import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertPatientInClinic, assertAppointmentInClinic } from "@/lib/clinic/ownership"
import {
  buildNoteListWhere,
  parsePageParams,
  parseNoteStatusFilter,
  normalizeSearch,
  paginationMeta,
} from "@/lib/prontuario"
import { createNoteSchema } from "../_schemas"
import { ownershipErrorResponse } from "../_helpers"

/**
 * GET /api/prontuario/notes — list/browse clinical notes.
 * - With ?patientId=... : the patient's record (used by the patient tab).
 * - Without patientId    : a cross-patient browser (?search=&status=&page=&pageSize=)
 *   used by the /prontuario page.
 * Self-scoping (agenda_own convention): an authoring professional (WRITE) only
 * ever lists their own notes; a read-only director (access === "READ") or an
 * admin without a professional profile may browse all professionals, optionally
 * narrowed by the professionalProfileId filter.
 */
export const GET = withFeatureAuth(
  { feature: "prontuario", minAccess: "READ" },
  async (req, { user, access }) => {
    const { searchParams } = new URL(req.url)
    const patientId = searchParams.get("patientId")

    if (patientId) {
      try {
        await assertPatientInClinic(user.clinicId, patientId)
      } catch (error) {
        const res = ownershipErrorResponse(error)
        if (res) return res
        throw error
      }
    }

    const isDirector = access === "READ" || user.professionalProfileId === null
    const requestedProf = searchParams.get("professionalProfileId")
    const scopedProf = isDirector ? requestedProf : user.professionalProfileId

    const { page, pageSize } = parsePageParams(
      { page: searchParams.get("page"), pageSize: searchParams.get("pageSize") },
      patientId ? 50 : undefined
    )
    const where = buildNoteListWhere({
      clinicId: user.clinicId,
      patientId,
      professionalProfileId: scopedProf,
      status: parseNoteStatusFilter(searchParams.get("status")),
      search: normalizeSearch(searchParams.get("search")),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    })

    const [total, notes] = await Promise.all([
      prisma.clinicalNote.count({ where }),
      prisma.clinicalNote.findMany({
        where,
        orderBy: { sessionDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          patient: { select: { name: true } },
          professionalProfile: { select: { user: { select: { name: true } } } },
          appointment: { select: { scheduledAt: true, status: true } },
          _count: { select: { addenda: true } },
        },
      }),
    ])

    // Directors with READ may read clinical content of this clinic; NONE viewers
    // never reach here. Section content itself is fetched on the detail route.
    return NextResponse.json({
      notes: notes.map((n) => ({
        id: n.id,
        patientId: n.patientId,
        patientName: n.patient?.name ?? null,
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
      ...paginationMeta(total, page, pageSize),
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
