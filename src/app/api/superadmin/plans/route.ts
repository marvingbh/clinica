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
  const { name, slug, stripePriceId, maxProfessionals, priceInCents, aiMonthlyCredits, allowPatientPortal, maxStorageMb } = body

  if (!name || !slug || !stripePriceId || maxProfessionals === undefined || !priceInCents) {
    return NextResponse.json(
      { error: "Todos os campos sao obrigatorios" },
      { status: 400 }
    )
  }

  // aiMonthlyCredits: 0 = no AI; -1 = unlimited; N >= 0 = N/month per clinic.
  const aiCredits =
    typeof aiMonthlyCredits === "number" && Number.isInteger(aiMonthlyCredits) && aiMonthlyCredits >= -1
      ? aiMonthlyCredits
      : 0

  // maxStorageMb: -1 = unlimited; N >= 0 = N MB quota. Default 1024 MB.
  const storageMb =
    typeof maxStorageMb === "number" && Number.isInteger(maxStorageMb) && maxStorageMb >= -1
      ? maxStorageMb
      : 1024

  const plan = await prisma.plan.create({
    data: {
      name,
      slug,
      stripePriceId,
      maxProfessionals,
      priceInCents,
      aiMonthlyCredits: aiCredits,
      allowPatientPortal: allowPatientPortal === true,
      maxStorageMb: storageMb,
    },
  })

  return NextResponse.json({ plan }, { status: 201 })
})
