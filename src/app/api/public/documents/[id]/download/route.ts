import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyDocumentLink } from "@/lib/documents/document-links"
import { documentFileName } from "@/app/api/documents/_lib/render-pdf"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"

/**
 * GET /api/public/documents/[id]/download?expires=&sig=
 *
 * Public, HMAC-signed (7-day) download of a generated document PDF. The clinic
 * is resolved from the document, never from a body. Rate-limited per IP with
 * generic anti-enumeration responses.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  const rl = await checkRateLimit(`document-download:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } }
    )
  }

  const sp = req.nextUrl.searchParams
  const expires = Number(sp.get("expires"))
  const sig = sp.get("sig") ?? ""

  const verification = verifyDocumentLink(id, expires, sig)
  if (!verification.valid) {
    return NextResponse.json({ error: verification.error }, { status: 403 })
  }

  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { title: true, pdfData: true },
  })
  if (!doc || !doc.pdfData) {
    // Generic response — a valid signature for a missing doc still 403s.
    return NextResponse.json({ error: "Link inválido" }, { status: 403 })
  }

  const bytes = Buffer.from(doc.pdfData)
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${documentFileName(doc.title)}"`,
      "Content-Length": String(bytes.length),
    },
  })
}
