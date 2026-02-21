import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const PATCH = withSuperAdmin(async (req: NextRequest, _admin, params) => {
  const body = await req.json()

  const plan = await prisma.plan.update({
    where: { id: params.id },
    data: body,
  })

  return NextResponse.json({ plan })
})
