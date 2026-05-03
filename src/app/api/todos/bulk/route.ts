import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma, Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos uma tarefa").max(500),
  action: z.enum(["complete", "uncomplete", "delete"]),
})

export const POST = withFeatureAuth(
  { feature: "todos", minAccess: "WRITE" },
  async (req, { user }) => {
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: "Corpo invalido" }, { status: 400 }) }

    const parsed = bulkSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 })
    }
    const { ids, action } = parsed.data

    const where: Prisma.TodoWhereInput = { id: { in: ids }, clinicId: user.clinicId }
    if (user.role !== Role.ADMIN && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    }

    if (action === "delete") {
      const result = await prisma.todo.deleteMany({ where })
      // `requested` lets the client surface "X of Y were skipped" if the user
      // accidentally selected rows they don't own.
      return NextResponse.json({ requested: ids.length, count: result.count })
    }

    const done = action === "complete"
    const result = await prisma.todo.updateMany({
      where,
      data: { done, doneAt: done ? new Date() : null },
    })
    return NextResponse.json({ requested: ids.length, count: result.count })
  }
)
