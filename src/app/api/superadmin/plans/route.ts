import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async () => {
  const plans = await prisma.plan.findMany({
    orderBy: { priceInCents: "asc" },
    include: { _count: { select: { clinics: true } } },
  })

  return NextResponse.json({ plans })
})

export const POST = withSuperAdmin(async (req: NextRequest) => {
  const body = await req.json()
  const { name, slug, stripePriceId, maxProfessionals, priceInCents } = body

  if (!name || !slug || !stripePriceId || maxProfessionals === undefined || !priceInCents) {
    return NextResponse.json(
      { error: "Todos os campos sao obrigatorios" },
      { status: 400 }
    )
  }

  const plan = await prisma.plan.create({
    data: { name, slug, stripePriceId, maxProfessionals, priceInCents },
  })

  return NextResponse.json({ plan }, { status: 201 })
})
