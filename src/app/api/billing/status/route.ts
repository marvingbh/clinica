import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuthentication } from "@/lib/api"

export const GET = withAuthentication(async (req: NextRequest, user) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeSubscriptionId: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          priceInCents: true,
          maxProfessionals: true,
        },
      },
    },
  })

  if (!clinic) {
    return NextResponse.json({ error: "Clinica nao encontrada" }, { status: 404 })
  }

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceInCents: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      priceInCents: true,
      maxProfessionals: true,
    },
  })

  return NextResponse.json({
    currentPlan: clinic.plan,
    subscriptionStatus: clinic.subscriptionStatus,
    trialEndsAt: clinic.trialEndsAt,
    hasSubscription: !!clinic.stripeSubscriptionId,
    plans,
  })
})
