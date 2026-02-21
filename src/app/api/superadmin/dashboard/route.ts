import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async () => {
  const [totalClinics, activeTrial, activeSubscription, canceledCount, pastDueCount] =
    await Promise.all([
      prisma.clinic.count(),
      prisma.clinic.count({ where: { subscriptionStatus: "trialing" } }),
      prisma.clinic.count({ where: { subscriptionStatus: "active" } }),
      prisma.clinic.count({ where: { subscriptionStatus: "canceled" } }),
      prisma.clinic.count({ where: { subscriptionStatus: "past_due" } }),
    ])

  const activeClinicPlans = await prisma.clinic.findMany({
    where: { subscriptionStatus: "active", planId: { not: null } },
    select: { plan: { select: { priceInCents: true } } },
  })

  const mrrInCents = activeClinicPlans.reduce(
    (sum, c) => sum + (c.plan?.priceInCents || 0),
    0
  )

  return NextResponse.json({
    totalClinics,
    activeTrial,
    activeSubscription,
    canceledCount,
    pastDueCount,
    mrrInCents,
  })
})
