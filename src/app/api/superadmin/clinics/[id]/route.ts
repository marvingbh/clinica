import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async (_req, _admin, params) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: {
      plan: true,
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { patients: true, appointments: true } },
    },
  })

  if (!clinic) {
    return NextResponse.json({ error: "Clinica nao encontrada" }, { status: 404 })
  }

  return NextResponse.json({ clinic })
})

export const PATCH = withSuperAdmin(async (req: NextRequest, _admin, params) => {
  const body = await req.json()
  const { action } = body

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id } })
  if (!clinic) {
    return NextResponse.json({ error: "Clinica nao encontrada" }, { status: 404 })
  }

  switch (action) {
    case "extend_trial": {
      const { days } = body
      const currentEnd = clinic.trialEndsAt || new Date()
      const newEnd = new Date(currentEnd)
      newEnd.setDate(newEnd.getDate() + (days || 14))
      await prisma.clinic.update({
        where: { id: params.id },
        data: { trialEndsAt: newEnd, subscriptionStatus: "trialing" },
      })
      return NextResponse.json({ ok: true, trialEndsAt: newEnd })
    }
    case "update_subscription": {
      const { planId, subscriptionStatus, trialEndsAt } = body
      const data: Record<string, unknown> = {}
      if (planId !== undefined) data.planId = planId || null
      if (subscriptionStatus !== undefined) data.subscriptionStatus = subscriptionStatus
      if (trialEndsAt !== undefined) data.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null
      await prisma.clinic.update({
        where: { id: params.id },
        data,
      })
      return NextResponse.json({ ok: true })
    }
    case "deactivate": {
      await prisma.clinic.update({
        where: { id: params.id },
        data: { isActive: false },
      })
      return NextResponse.json({ ok: true })
    }
    case "reactivate": {
      await prisma.clinic.update({
        where: { id: params.id },
        data: { isActive: true },
      })
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 })
  }
})
