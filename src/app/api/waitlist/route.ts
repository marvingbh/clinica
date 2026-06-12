import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { AuditAction, createAuditLog } from "@/lib/rbac/audit"
import {
  createEntrySchema,
  entryVisibilityWhere,
  serializeEntry,
} from "@/lib/waitlist"
import { patientBelongsToClinic, professionalBelongsToClinic } from "@/lib/clinic/ownership"

const ENTRY_SELECT = {
  id: true,
  patientId: true,
  leadName: true,
  leadPhone: true,
  leadEmail: true,
  professionalProfileId: true,
  preferences: true,
  priorityNote: true,
  priority: true,
  status: true,
  removedReason: true,
  lastOfferedAt: true,
  createdAt: true,
  patient: { select: { id: true, name: true, phone: true, isActive: true } },
  professionalProfile: { select: { user: { select: { name: true } } } },
} as const

/** GET /api/waitlist?status=&professionalProfileId= — list entries (clinic-scoped + visibility cut). */
export const GET = withFeatureAuth(
  { feature: "waitlist", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const professionalProfileId = searchParams.get("professionalProfileId")
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")

    const entries = await prisma.waitlistEntry.findMany({
      where: {
        clinicId: user.clinicId,
        ...(status ? { status: status as never } : {}),
        ...(professionalProfileId ? { professionalProfileId } : {}),
        ...entryVisibilityWhere({ canSeeOthers, professionalProfileId: user.professionalProfileId }),
      },
      select: ENTRY_SELECT,
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({ entries: entries.map(serializeEntry) })
  }
)

/** POST /api/waitlist — create an entry (existing patient XOR lead). */
export const POST = withFeatureAuth(
  { feature: "waitlist", minAccess: "WRITE" },
  async (req, { user }) => {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
    }

    const parsed = createEntrySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados invalidos" },
        { status: 400 }
      )
    }
    const data = parsed.data

    // Ownership validation for FK ids from the body.
    if (data.patientId && !(await patientBelongsToClinic(data.patientId, user.clinicId))) {
      return NextResponse.json({ error: "Paciente nao encontrado" }, { status: 404 })
    }
    if (
      data.professionalProfileId &&
      !(await professionalBelongsToClinic(data.professionalProfileId, user.clinicId))
    ) {
      return NextResponse.json({ error: "Profissional nao encontrado" }, { status: 404 })
    }

    // Duplicate check (mirrors the partial unique index).
    if (data.patientId) {
      const existing = await prisma.waitlistEntry.findFirst({
        where: {
          clinicId: user.clinicId,
          patientId: data.patientId,
          professionalProfileId: data.professionalProfileId ?? null,
          status: { in: ["ATIVA", "OFERTADA"] },
        },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json(
          { error: "Este paciente já está na lista de espera" },
          { status: 409 }
        )
      }
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        clinicId: user.clinicId,
        patientId: data.patientId ?? null,
        leadName: data.patientId ? null : data.leadName ?? null,
        leadPhone: data.patientId ? null : data.leadPhone ?? null,
        leadEmail: data.patientId ? null : data.leadEmail ?? null,
        professionalProfileId: data.professionalProfileId ?? null,
        preferences: data.preferences ?? {},
        priorityNote: data.priorityNote ?? null,
      },
      select: ENTRY_SELECT,
    })

    await createAuditLog({
      user,
      action: AuditAction.WAITLIST_ENTRY_CREATED,
      entityType: "WaitlistEntry",
      entityId: entry.id,
      newValues: { patientId: entry.patientId, professionalProfileId: entry.professionalProfileId },
    })

    return NextResponse.json({ entry: serializeEntry(entry) }, { status: 201 })
  }
)
