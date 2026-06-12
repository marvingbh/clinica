import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import type { DocumentType } from "@/lib/documents"
import { generationBodySchema } from "../_lib/schema"
import { buildGeneration, buildDocumentTitle } from "../_lib/build-generation"
import { canAccessPatientDocuments } from "../_lib/scope"
import { renderDocumentPdf } from "../_lib/render-pdf"

const CLINIC_TZ_DEFAULT = "America/Sao_Paulo"

export const POST = withFeatureAuth(
  { feature: "documents", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const parsed = generationBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    if (!(await canAccessPatientDocuments(user, parsed.data.patientId))) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    const templateType = parsed.data.templateType as DocumentType
    const result = await buildGeneration(user, { ...parsed.data, templateType })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    if (result.missingFields.length > 0) {
      return NextResponse.json({ error: "Faltam dados para gerar este documento", missingFields: result.missingFields }, { status: 422 })
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { timezone: true },
    })
    const timezone = clinic?.timezone ?? CLINIC_TZ_DEFAULT

    const pdfBuffer = await renderDocumentPdf({
      templateType,
      content: result.content,
      sessionRows: result.sessionRows,
      clinicName: result.clinicName,
      clinicAddress: result.clinicAddress,
      clinicPhone: result.clinicPhone,
      clinicLogo: result.clinicLogo,
      generatedAt: result.generatedAt,
      timezone,
    })

    const title = buildDocumentTitle(templateType, result.generatedAt, timezone)

    const doc = await prisma.generatedDocument.create({
      data: {
        clinicId: user.clinicId,
        patientId: parsed.data.patientId,
        professionalProfileId: result.signingProfessionalId,
        appointmentId: parsed.data.appointmentId ?? null,
        templateId: parsed.data.templateId ?? null,
        templateType,
        templateName: result.templateName,
        title,
        contentSnapshot: result.content,
        mergeData: {
          sessionRows: result.sessionRows,
          invoiceItemIds: parsed.data.invoiceItemIds ?? [],
          manualFieldKeys: Object.keys(parsed.data.manualFields ?? {}),
        } as unknown as Prisma.InputJsonValue,
        pdfData: new Uint8Array(pdfBuffer),
        generatedByUserId: user.id,
      },
      select: { id: true, title: true },
    })

    await audit.log({
      user,
      action: AuditAction.DOCUMENT_GENERATED,
      entityType: "GeneratedDocument",
      entityId: doc.id,
      newValues: { templateType, patientId: parsed.data.patientId },
      request: req,
    }).catch(() => {})

    return NextResponse.json({ id: doc.id, title: doc.title }, { status: 201 })
  }
)
