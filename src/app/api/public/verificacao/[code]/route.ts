import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import {
  normalizeVerificationCode,
  formatVerificationCode,
  toVerificationResult,
} from "@/lib/assinaturas"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * Public integrity check by verification code. Anti-enumeration: any miss
 * returns 200 { valido: false } with no clinical data. Names/CPFs are masked.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`verificacao:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) {
    return NextResponse.json({ valido: false }, { status: 429, headers: NO_STORE })
  }

  const { code } = await params
  const normalized = normalizeVerificationCode(code)
  if (normalized.length !== 12) return NextResponse.json({ valido: false }, { headers: NO_STORE })

  const envelope = await prisma.signatureEnvelope.findUnique({
    where: { verificationCode: formatVerificationCode(normalized) },
    select: {
      id: true, status: true, documentId: true, patientId: true,
      verificationCode: true, signedSha256: true, originalSha256: true,
      countersignedAt: true, completedAt: true, createdAt: true,
      clinic: { select: { name: true } },
      document: { select: { title: true } },
      requests: { orderBy: { signingOrder: "asc" } },
    },
  })
  if (!envelope || envelope.status !== "CONCLUIDO") {
    return NextResponse.json({ valido: false }, { headers: NO_STORE })
  }

  const result = toVerificationResult(
    { ...envelope, clinicName: envelope.clinic.name, documentTitle: envelope.document.title },
    envelope.requests
  )
  return NextResponse.json(result, { headers: NO_STORE })
}
