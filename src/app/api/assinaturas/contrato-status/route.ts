import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { CONTRACT_DOC_TYPES } from "@/lib/assinaturas"
import { canAccessPatientSignatures } from "../_lib/scope"

/**
 * Telepsychology guard (Res. CFP 09/2024): does the patient have a signed
 * therapeutic contract? Also surfaces a pending envelope / a generated-but-
 * unsent contract document for the one-click "Enviar para assinatura" CTA.
 */
export const GET = withFeatureAuth(
  { feature: "assinaturas", minAccess: "READ" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const patientId = new URL(req.url).searchParams.get("patientId")
    if (!patientId) return NextResponse.json({ error: "patientId obrigatório" }, { status: 400 })
    if (!(await canAccessPatientSignatures(user, patientId))) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    const contractTypes = [...CONTRACT_DOC_TYPES] as never[]

    const signed = await prisma.signatureEnvelope.findFirst({
      where: {
        clinicId: user.clinicId,
        patientId,
        status: "CONCLUIDO",
        document: { templateType: { in: contractTypes } },
      },
      select: { id: true },
    })

    let pendingEnvelopeId: string | undefined
    let contractDocumentId: string | undefined
    if (!signed) {
      const pending = await prisma.signatureEnvelope.findFirst({
        where: {
          clinicId: user.clinicId,
          patientId,
          status: "EM_ANDAMENTO",
          document: { templateType: { in: contractTypes } },
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      })
      pendingEnvelopeId = pending?.id

      if (!pending) {
        const contractDoc = await prisma.generatedDocument.findFirst({
          where: { clinicId: user.clinicId, patientId, templateType: { in: contractTypes } },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        })
        contractDocumentId = contractDoc?.id
      }
    }

    return NextResponse.json({
      hasSignedContract: !!signed,
      pendingEnvelopeId,
      contractDocumentId,
    })
  }
)
