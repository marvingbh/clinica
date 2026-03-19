import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api/with-auth"
import { intakeUpdateSchema, mapSubmissionToPatient } from "@/lib/intake"
import { audit, AuditAction } from "@/lib/rbac"

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

    // Approve: all checks + creation inside a single transaction
    try {
      const result = await prisma.$transaction(async (tx) => {
        const submission = await tx.intakeSubmission.findFirst({
          where: { id, clinicId: user.clinicId, status: "PENDING" },
        })

        if (!submission) {
          throw new Error("NOT_FOUND")
        }

        const patientData = mapSubmissionToPatient(submission, user.clinicId)

        const patient = await tx.patient.create({
          data: patientData,
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

        return patient
      })

      await audit.log({
        user,
        action: AuditAction.INTAKE_APPROVED,
        entityType: "IntakeSubmission",
        entityId: id,
        newValues: { patientId: result.id },
        request: req,
      })

      return NextResponse.json({
        message: "Ficha aprovada e paciente criado",
        patientId: result.id,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ""
      if (message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Ficha nao encontrada ou ja foi revisada" },
          { status: 404 }
        )
      }
      // Prisma unique constraint violation (e.g. duplicate billingCpf if cpf constraint added later)
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
