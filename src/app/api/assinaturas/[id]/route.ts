import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { toEnvelopeDetail } from "@/lib/assinaturas"
import { canAccessPatientSignatures } from "../_lib/scope"

export const GET = withFeatureAuth(
  { feature: "assinaturas", minAccess: "READ" },
  async (_req: NextRequest, { user }: { user: AuthUser }, params) => {
    const envelope = await prisma.signatureEnvelope.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: {
        id: true, status: true, documentId: true, patientId: true,
        verificationCode: true, signedSha256: true, originalSha256: true,
        countersignedAt: true, completedAt: true, createdAt: true,
        requests: true,
        clinic: { select: { timezone: true } },
      },
    })
    if (!envelope) return NextResponse.json({ error: "Envelope não encontrado" }, { status: 404 })
    if (!(await canAccessPatientSignatures(user, envelope.patientId))) {
      return NextResponse.json({ error: "Envelope não encontrado" }, { status: 404 })
    }
    return NextResponse.json({
      envelope: toEnvelopeDetail(envelope, envelope.requests, envelope.clinic.timezone),
    })
  }
)
