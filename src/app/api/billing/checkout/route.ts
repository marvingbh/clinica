import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { withAuthentication } from "@/lib/api"

export const POST = withAuthentication(async (req: NextRequest, user) => {
  const body = await req.json()
  const { planId } = body

  if (!planId) {
    return NextResponse.json({ error: "planId obrigatorio" }, { status: 400 })
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem gerenciar a assinatura" },
      { status: 403 }
    )
  }

  const [clinic, plan] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    }),
    prisma.plan.findUnique({
      where: { id: planId },
      select: { stripePriceId: true, isActive: true },
    }),
  ])

  if (!clinic?.stripeCustomerId) {
    return NextResponse.json({ error: "Clinica sem cadastro no Stripe" }, { status: 400 })
  }

  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: "Plano invalido" }, { status: 400 })
  }

  if (clinic.stripeSubscriptionId) {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: clinic.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing`,
    })
    return NextResponse.json({ url: portalSession.url })
  }

  const session = await stripe.checkout.sessions.create({
    customer: clinic.stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?canceled=true`,
    metadata: { clinicId: user.clinicId, planId },
  })

  return NextResponse.json({ url: session.url })
})
