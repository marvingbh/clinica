import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const status = searchParams.get("status") || ""
  const page = parseInt(searchParams.get("page") || "1")
  const limit = 20

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ]
  }
  if (status) where.subscriptionStatus = status

  const [clinics, total] = await Promise.all([
    prisma.clinic.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        isActive: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
        plan: { select: { id: true, name: true, slug: true } },
        _count: { select: { users: true, patients: true } },
      },
    }),
    prisma.clinic.count({ where }),
  ])

  return NextResponse.json({
    clinics,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
})
