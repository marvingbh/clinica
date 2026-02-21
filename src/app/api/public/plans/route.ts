import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceInCents: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      maxProfessionals: true,
      priceInCents: true,
    },
  })

  return NextResponse.json({ plans })
}
