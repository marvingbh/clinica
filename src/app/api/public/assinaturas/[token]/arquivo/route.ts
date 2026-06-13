import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import { hashSigningToken } from "@/lib/assinaturas"

/**
 * Serves the signed via to the signer after completion. The token stays valid
 * for download even once signed (status ASSINADO + envelope CONCLUIDO).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`assinatura-file:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 })

  const { token } = await params
  if (!token || token.length < 10) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const request = await prisma.signatureRequest.findUnique({
    where: { tokenHash: hashSigningToken(token) },
    select: {
      status: true,
      envelope: { select: { status: true, signedPdf: true, document: { select: { title: true } } } },
    },
  })
  if (!request?.envelope || request.envelope.status !== "CONCLUIDO" || !request.envelope.signedPdf) {
    return NextResponse.json({ error: "Documento não disponível" }, { status: 404 })
  }

  const bytes = Buffer.from(request.envelope.signedPdf)
  const safe = request.envelope.document.title.replace(/[^\w\-. ]/g, "_").slice(0, 80) || "documento"
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}-assinado.pdf"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  })
}
