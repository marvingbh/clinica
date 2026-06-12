import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { AuditAction, createAuditLog } from "@/lib/rbac/audit"
import { reorderSchema } from "@/lib/waitlist"

/** POST /api/waitlist/reorder — set manual priority from an ordered id list. */
export const POST = withFeatureAuth(
  { feature: "waitlist", minAccess: "WRITE" },
  async (req, { user }) => {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
    }
    const parsed = reorderSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 })
    }
    const { orderedIds } = parsed.data

    // Every id must belong to the clinic.
    const owned = await prisma.waitlistEntry.findMany({
      where: { id: { in: orderedIds }, clinicId: user.clinicId },
      select: { id: true },
    })
    if (owned.length !== orderedIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais entradas não pertencem à sua clínica" },
        { status: 404 }
      )
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.waitlistEntry.update({
          where: { id },
          data: { priority: index },
        })
      )
    )

    await createAuditLog({
      user,
      action: AuditAction.WAITLIST_ENTRIES_REORDERED,
      entityType: "WaitlistEntry",
      entityId: orderedIds[0],
      newValues: { count: orderedIds.length },
    })

    return NextResponse.json({ success: true })
  }
)
