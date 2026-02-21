import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { withAuthentication } from "@/lib/api"

export const POST = withAuthentication(async (req: NextRequest, user) => {
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem gerenciar a assinatura" },
      { status: 403 }
    )
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: { stripeCustomerId: true },
  })

  if (!clinic?.stripeCustomerId) {
    return NextResponse.json({ error: "Clinica sem cadastro no Stripe" }, { status: 400 })
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: clinic.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
})
