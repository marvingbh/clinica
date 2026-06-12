import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyChargeLink } from "@/lib/cobranca"
import { regenerateSessionIfNeeded } from "@/lib/cobranca/charge-service"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

function unavailable(reason: string): NextResponse {
  return NextResponse.redirect(`${appBaseUrl()}/pagar/indisponivel?motivo=${reason}`, 302)
}

/**
 * GET /api/public/pagar/[chargeId]?s=hmac
 * Public, unauthenticated. HMAC prevents enumeration; the charge link is
 * stable while the underlying Stripe Checkout Session is regenerated on demand.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ chargeId: string }> }
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  const rl = await checkRateLimit(`pagar:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } }
    )
  }

  const { chargeId } = await ctx.params
  const sig = new URL(req.url).searchParams.get("s") ?? ""
  if (!verifyChargeLink(chargeId, sig)) return unavailable("invalido")

  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId },
    select: { id: true, status: true, expiresAt: true, viewedAt: true },
  })
  if (!charge) return unavailable("invalido")
  if (charge.status === "PAGA") return unavailable("pago")
  if (charge.status === "REEMBOLSADA") return unavailable("invalido")
  if (charge.status === "CANCELADA") return unavailable("expirado")

  if (charge.status === "EXPIRADA" || charge.expiresAt.getTime() < Date.now()) {
    if (charge.status !== "EXPIRADA") {
      await prisma.paymentCharge.update({
        where: { id: charge.id },
        data: { status: "EXPIRADA" },
      })
    }
    return unavailable("expirado")
  }

  if (!charge.viewedAt) {
    await prisma.paymentCharge.update({
      where: { id: charge.id },
      data: { viewedAt: new Date() },
    })
  }

  const url = await regenerateSessionIfNeeded(charge.id)
  if (!url) return unavailable("invalido")
  return NextResponse.redirect(url, 302)
}
