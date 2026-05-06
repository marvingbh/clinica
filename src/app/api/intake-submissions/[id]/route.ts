import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api/with-auth"
import { intakeUpdateSchema, mapSubmissionToPatient } from "@/lib/intake"
import { audit, AuditAction } from "@/lib/rbac"
import { patientApiSchema } from "@/lib/patients/schema"

/**
 * GET /api/intake-submissions/[id] — Fetch a single submission
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (req: NextRequest, { user }, params) => {
    const id = params.id

    const submission = await prisma.intakeSubmission.findFirst({
      where: { id, clinicId: user.clinicId },
    })

    if (!submission) {
      return NextResponse.json({ error: "Ficha nao encontrada" }, { status: 404 })
    }

    return NextResponse.json(submission)
  }
)

/**
 * PUT /api/intake-submissions/[id] — Edit submission fields before approval
 */
export const PUT = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const id = params.id

    const submission = await prisma.intakeSubmission.findFirst({
      where: { id, clinicId: user.clinicId, status: "PENDING" },
    })

    if (!submission) {
      return NextResponse.json(
        { error: "Ficha nao encontrada ou ja foi revisada" },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = intakeUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const data = parsed.data
    const updateData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateData[key] = value
    }

    if (typeof data.childBirthDate === "string") {
      updateData.childBirthDate = new Date(data.childBirthDate)
    }

    const updated = await prisma.intakeSubmission.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  }
)

/**
 * PATCH /api/intake-submissions/[id] — Approve or reject
 * Body: { action: "approve" | "reject" }
 */
export const PATCH = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const id = params.id
    const body = await req.json()
    const action = body.action as string

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 })
    }

    if (action === "reject") {
      const updated = await prisma.intakeSubmission.updateMany({
        where: { id, clinicId: user.clinicId, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      })

      if (updated.count === 0) {
        return NextResponse.json(
          { error: "Ficha nao encontrada ou ja foi revisada" },
          { status: 404 }
        )
      }

      await audit.log({
        user,
        action: AuditAction.INTAKE_REJECTED,
        entityType: "IntakeSubmission",
        entityId: id,
        request: req,
      })

      return NextResponse.json({ message: "Ficha rejeitada" })
    }

    // Approve: optionally accept operator-edited patient overrides.
    // When `patient` is present in the body, the operator filled in the
    // admin fields inline — merge their data on top of the intake mapping
    // (operator wins for everything except consent timestamps, which
    // must keep reflecting the original submission moment).
    let operatorOverrides: import("@/lib/patients/schema").PatientApiInput | null = null
    if (body.patient !== undefined && body.patient !== null) {
      const parsed = patientApiSchema.safeParse(body.patient)
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Dados do paciente inválidos", details: parsed.error.flatten() },
          { status: 400 }
        )
      }
      operatorOverrides = parsed.data
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const submission = await tx.intakeSubmission.findFirst({
          where: { id, clinicId: user.clinicId, status: "PENDING" },
        })

        if (!submission) {
          throw new Error("NOT_FOUND")
        }

        const mapped = mapSubmissionToPatient(submission, user.clinicId)
        const now = new Date()

        let patientCreateData: Prisma.PatientUncheckedCreateInput =
          mapped as unknown as Prisma.PatientUncheckedCreateInput
        let nestedAdditionalPhones: { phone: string; label: string; notify: boolean }[] = []
        let editedFieldNames: string[] = []

        if (operatorOverrides) {
          const o = operatorOverrides

          // Defensive duplicate-CPF check inside the tx — friendlier
          // than relying on the DB unique constraint to throw P2002.
          const normalizedCpf = o.cpf ? o.cpf.replace(/\D/g, "") : null
          if (normalizedCpf) {
            const existing = await tx.patient.findUnique({
              where: { clinicId_cpf: { clinicId: user.clinicId, cpf: normalizedCpf } },
            })
            if (existing) throw new Error("DUPLICATE_CPF")
          }

          // Phone uniqueness across primary + additional, mirroring POST /api/patients.
          const normalizedPrimaryPhone = o.phone.replace(/\D/g, "")
          const normalizedAdditional = (o.additionalPhones ?? []).map((p) => ({
            phone: p.phone.replace(/\D/g, ""),
            label: p.label,
            notify: p.notify ?? true,
          }))
          const allPhones = [normalizedPrimaryPhone, ...normalizedAdditional.map((p) => p.phone)]
          if (new Set(allPhones).size !== allPhones.length) {
            throw new Error("DUPLICATE_PHONE")
          }
          nestedAdditionalPhones = normalizedAdditional

          // Consent-timestamp merge:
          //   - operator true + mapping had the timestamp → keep mapping's
          //   - operator true + mapping had no timestamp (intake was false,
          //     operator flipped to true) → stamp now
          //   - operator false → null
          const consentPhotoVideoAt = o.consentWhatsApp /* placeholder, see below */
          // (we don't expose consentPhotoVideo in patientApiSchema today, so
          // it stays whatever the mapping produced — operator can't toggle it)

          patientCreateData = {
            // Always-from-mapping
            clinicId: user.clinicId,
            // Below: full Prisma shape — annotated as Unchecked since we
            // pass clinicId as a scalar and reference fields by FK id.
            // From operator (overrides any intake-derived value)
            name: o.name,
            phone: normalizedPrimaryPhone,
            email: o.email || null,
            birthDate: o.birthDate ? new Date(o.birthDate + "T00:00:00") : null,
            cpf: normalizedCpf,
            billingCpf: o.billingCpf ? o.billingCpf.replace(/\D/g, "") : null,
            billingResponsibleName: o.billingResponsibleName || null,
            nfseDescriptionTemplate: o.nfseDescriptionTemplate || null,
            nfsePerAppointment: o.nfsePerAppointment ?? false,
            nfseObs: o.nfseObs || null,
            addressStreet: o.addressStreet || null,
            addressNumber: o.addressNumber || null,
            addressNeighborhood: o.addressNeighborhood || null,
            addressCity: o.addressCity || null,
            addressState: o.addressState || null,
            addressZip: o.addressZip?.replace(/\D/g, "") || null,
            fatherName: o.fatherName || null,
            motherName: o.motherName || null,
            schoolName: o.schoolName || null,
            firstAppointmentDate: o.firstAppointmentDate
              ? new Date(o.firstAppointmentDate + "T00:00:00")
              : null,
            sessionFee: o.sessionFee ?? null,
            lastFeeAdjustmentDate: o.lastFeeAdjustmentDate
              ? new Date(o.lastFeeAdjustmentDate + "T00:00:00")
              : null,
            therapeuticProject: o.therapeuticProject || null,
            notes: o.notes || null,
            referenceProfessionalId: o.referenceProfessionalId || null,
            invoiceGrouping: o.invoiceGrouping || null,
            // Consents not exposed by the operator form (LGPD-from-intake)
            consentPhotoVideo: mapped.consentPhotoVideo,
            consentPhotoVideoAt: mapped.consentPhotoVideoAt,
            consentSessionRecording: mapped.consentSessionRecording,
            consentSessionRecordingAt: mapped.consentSessionRecordingAt,
            // Operator-driven consents (not on the intake form)
            consentWhatsApp: o.consentWhatsApp,
            consentWhatsAppAt: o.consentWhatsApp ? now : null,
            consentEmail: o.consentEmail,
            consentEmailAt: o.consentEmail ? now : null,
            // Carry the school details from the intake mapping
            // (operator form doesn't expose schoolUnit / schoolShift)
            schoolUnit: mapped.schoolUnit ?? undefined,
            schoolShift: mapped.schoolShift ?? undefined,
            motherPhone: mapped.motherPhone ?? undefined,
            fatherPhone: mapped.fatherPhone ?? undefined,
          }

          // Audit traceability: which admin fields the operator filled in.
          // Pure compare to the mapping baseline; ignore consent timestamps
          // since those are intentionally server-managed.
          const editedFields: string[] = []
          const compare: [keyof typeof o, unknown][] = [
            ["name", mapped.name],
            ["phone", mapped.phone],
            ["email", mapped.email ?? null],
            ["sessionFee", null],
            ["referenceProfessionalId", null],
            ["therapeuticProject", null],
            ["invoiceGrouping", null],
            ["nfsePerAppointment", false],
          ]
          for (const [k, baseline] of compare) {
            const operatorValue = o[k]
            if (operatorValue !== baseline && operatorValue !== "") {
              editedFields.push(String(k))
            }
          }
          // Avoid TS unused-var for the placeholder above
          void consentPhotoVideoAt
          editedFieldNames = editedFields
        }

        const patient = await tx.patient.create({
          data: {
            ...patientCreateData,
            ...(nestedAdditionalPhones.length > 0
              ? {
                  additionalPhones: {
                    create: nestedAdditionalPhones.map((p) => ({
                      clinicId: user.clinicId,
                      phone: p.phone,
                      label: p.label,
                      notify: p.notify,
                    })),
                  },
                }
              : {}),
          },
          include: {
            additionalPhones: {
              select: { id: true, phone: true, label: true, notify: true },
              orderBy: { createdAt: "asc" },
            },
          },
        })

        await tx.intakeSubmission.update({
          where: { id },
          data: {
            status: "APPROVED",
            patientId: patient.id,
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
          },
        })

        return { patient, editedFieldNames }
      })

      await audit.log({
        user,
        action: AuditAction.INTAKE_APPROVED,
        entityType: "IntakeSubmission",
        entityId: id,
        newValues: {
          patientId: result.patient.id,
          edited: result.editedFieldNames.length > 0,
          ...(result.editedFieldNames.length > 0 ? { editedFields: result.editedFieldNames } : {}),
        },
        request: req,
      })

      return NextResponse.json({
        message: "Ficha aprovada e paciente criado",
        patientId: result.patient.id,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ""
      if (message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Ficha nao encontrada ou ja foi revisada" },
          { status: 404 }
        )
      }
      if (message === "DUPLICATE_CPF") {
        return NextResponse.json(
          { error: "Já existe um paciente com este CPF" },
          { status: 409 }
        )
      }
      if (message === "DUPLICATE_PHONE") {
        return NextResponse.json(
          { error: "Números de telefone duplicados não são permitidos" },
          { status: 400 }
        )
      }
      // Prisma unique constraint violation (defense in depth)
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
        return NextResponse.json(
          { error: "Erro de duplicidade ao criar paciente. Verifique os dados." },
          { status: 409 }
        )
      }
      throw error
    }
  }
)
