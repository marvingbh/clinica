import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuthentication, forbiddenResponse } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { purgePatient } from "@/lib/patients/purge"

const schema = z.object({
  reason: z.string().min(10, "Motivo deve ter pelo menos 10 caracteres").max(500),
  confirmationName: z.string().min(1),
})

/**
 * POST /api/patients/[id]/purge
 *
 * LGPD Art. 18 "direito de eliminação". Anonymizes the patient row and
 * cascades redaction into dependent tables. Does NOT hard-delete —
 * referential integrity with invoices/NFS-e is required by Brazilian tax
 * (CTN) and clinical (CFP) retention law.
 *
 * Hard ADMIN check (not feature-based) — even an elevated PROFESSIONAL
 * with `patients:WRITE` cannot purge. Requires typed patient-name
 * confirmation + a reason (ideally the ANPD data-subject request ID).
 *
 * Current MVP is immediate purge. A 24h notification-delay flow with
 * cancel-link to all clinic admins is deferred to v2 per the plan.
 */
export const POST = withAuthentication(async (req, user, params) => {
  if (user.role !== "ADMIN") {
    return forbiddenResponse("Apenas administradores podem eliminar dados de paciente")
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, clinicId: user.clinicId },
    select: { id: true, name: true },
  })
  if (!patient) {
    return NextResponse.json({ error: "Paciente nao encontrado" }, { status: 404 })
  }

  // Idempotency: if already purged, return the prior result.
  if (patient.name !== "[Paciente removido]") {
    if (parsed.data.confirmationName.trim() !== patient.name.trim()) {
      return NextResponse.json(
        { error: "O nome de confirmacao nao corresponde ao paciente" },
        { status: 400 },
      )
    }
  }

  const result = await purgePatient({
    patientId: params.id,
    actingUser: user,
    reason: parsed.data.reason,
  })

  return NextResponse.json({
    success: true,
    purgeAuditId: result.purgeAuditId,
    rowCounts: result.rowCounts,
  })
})
