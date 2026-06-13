import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"
import { resolveSigningToken } from "../../_lib/resolve"

/**
 * Serves the original PDF inline for the signer to read. Runs the same gates as
 * the view route but mutates nothing. 404 (generic) on any non-active state.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req.headers)
  const rate = await checkRateLimit(`assinatura-pdf:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 })
  }

  const { token } = await params
  const outcome = await resolveSigningToken(token)
  if (outcome.kind !== "ok" && outcome.kind !== "completed_self") {
    return NextResponse.json({ error: "Documento não disponível" }, { status: 404 })
  }

  const doc = await prisma.generatedDocument.findUnique({
    where: { id: outcome.ctx.documentId },
    select: { pdfData: true, title: true },
  })
  if (!doc?.pdfData) return NextResponse.json({ error: "Documento não disponível" }, { status: 404 })

  const bytes = Buffer.from(doc.pdfData)
  const safe = doc.title.replace(/[^\w\-. ]/g, "_").slice(0, 80) || "documento"
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}.pdf"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  })
}
