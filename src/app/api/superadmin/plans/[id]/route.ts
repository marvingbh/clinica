import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

const ALLOWED_FIELDS = [
  "name",
  "slug",
  "stripePriceId",
  "maxProfessionals",
  "priceInCents",
  "isActive",
  "aiMonthlyCredits",
] as const

export const PATCH = withSuperAdmin(async (req: NextRequest, _admin, params) => {
  const body = await req.json()

  // Whitelist updatable fields and validate aiMonthlyCredits (>= -1, integer).
  const data: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key]
  }
  if (data.aiMonthlyCredits !== undefined) {
    const v = data.aiMonthlyCredits
    if (typeof v !== "number" || !Number.isInteger(v) || v < -1) {
      return NextResponse.json({ error: "aiMonthlyCredits inválido" }, { status: 400 })
    }
  }

  const plan = await prisma.plan.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json({ plan })
})
