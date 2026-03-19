import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api/with-auth"
import { mapSubmissionToPatient } from "@/lib/intake"

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

    const updated = await prisma.intakeSubmission.update({
      where: { id },
      data: {
        childName: body.childName ?? submission.childName,
        childBirthDate: body.childBirthDate ? new Date(body.childBirthDate) : submission.childBirthDate,
        guardianName: body.guardianName ?? submission.guardianName,
        guardianCpfCnpj: body.guardianCpfCnpj ?? submission.guardianCpfCnpj,
        phone: body.phone ?? submission.phone,
        email: body.email ?? submission.email,
        addressStreet: body.addressStreet ?? submission.addressStreet,
        addressNumber: body.addressNumber ?? submission.addressNumber,
        addressNeighborhood: body.addressNeighborhood ?? submission.addressNeighborhood,
        addressCity: body.addressCity ?? submission.addressCity,
        addressState: body.addressState ?? submission.addressState,
        addressZip: body.addressZip ?? submission.addressZip,
        schoolName: body.schoolName ?? submission.schoolName,
        schoolUnit: body.schoolUnit ?? submission.schoolUnit,
        schoolShift: body.schoolShift ?? submission.schoolShift,
        motherName: body.motherName ?? submission.motherName,
        motherPhone: body.motherPhone ?? submission.motherPhone,
        fatherName: body.fatherName ?? submission.fatherName,
        fatherPhone: body.fatherPhone ?? submission.fatherPhone,
        consentPhotoVideo: body.consentPhotoVideo ?? submission.consentPhotoVideo,
        consentSessionRecording: body.consentSessionRecording ?? submission.consentSessionRecording,
      },
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

    const submission = await prisma.intakeSubmission.findFirst({
      where: { id, clinicId: user.clinicId, status: "PENDING" },
    })

    if (!submission) {
      return NextResponse.json(
        { error: "Ficha nao encontrada ou ja foi revisada" },
        { status: 404 }
      )
    }

    if (action === "reject") {
      await prisma.intakeSubmission.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      })

      return NextResponse.json({ message: "Ficha rejeitada" })
    }

    // Approve: create patient in a transaction
    const patientData = mapSubmissionToPatient(submission, user.clinicId)

    // Check CPF conflict
    if (patientData.cpf) {
      const existingPatient = await prisma.patient.findUnique({
        where: {
          clinicId_cpf: {
            clinicId: user.clinicId,
            cpf: patientData.cpf,
          },
        },
        select: { id: true, name: true },
      })

      if (existingPatient) {
        return NextResponse.json(
          {
            error: `Ja existe um paciente com este CPF: ${existingPatient.name}`,
            existingPatientId: existingPatient.id,
          },
          { status: 409 }
        )
      }
    }

    const result = await prisma.$transaction(async (tx) => {
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

    return NextResponse.json({
      message: "Ficha aprovada e paciente criado",
      patientId: result.id,
    })
  }
)
