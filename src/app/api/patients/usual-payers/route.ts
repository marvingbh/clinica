import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const deleteSchema = z.object({
  id: z.string(),
})

export const DELETE = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const usualPayer = await prisma.patientUsualPayer.findFirst({
      where: { id: parsed.data.id, clinicId: user.clinicId },
    })

    if (!usualPayer) {
      return NextResponse.json(
        { error: "Pagador usual não encontrado" },
        { status: 404 }
      )
    }

    await prisma.patientUsualPayer.delete({
      where: { id: usualPayer.id },
    })

    return NextResponse.json({ message: "Pagador usual removido" })
  }
)
