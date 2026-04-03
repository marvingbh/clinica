import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"

const schema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
})

/**
 * POST /api/groups/[groupId]/finalize
 * Finalize a group recurrence: deactivate the group and delete future sessions.
 */
export const POST = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { groupId } = params
    const body = await req.json()

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const endDateTime = new Date(parsed.data.endDate + "T23:59:59.999")

    const group = await prisma.therapyGroup.findFirst({
      where: { id: groupId, clinicId: user.clinicId },
    })

    if (!group) {
      return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Deactivate the group
      await tx.therapyGroup.update({
        where: { id: groupId },
        data: { isActive: false },
      })

      // Delete future appointments for this group after the end date
      const deleted = await tx.appointment.deleteMany({
        where: {
          groupId,
          clinicId: user.clinicId,
          scheduledAt: { gt: endDateTime },
          status: { notIn: ["FINALIZADO"] },
        },
      })

      return deleted.count
    })

    return NextResponse.json({
      success: true,
      deletedCount: result,
    })
  }
)
