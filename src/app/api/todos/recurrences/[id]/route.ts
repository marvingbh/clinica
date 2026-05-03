import { NextResponse } from "next/server"
import { z } from "zod"
import { Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
})

async function loadAndCheck(id: string, user: { clinicId: string; role: Role; professionalProfileId: string | null }) {
  const rec = await prisma.todoRecurrence.findFirst({ where: { id, clinicId: user.clinicId } })
  if (!rec) return { error: "Serie nao encontrada", status: 404 } as const
  if (user.role !== Role.ADMIN && rec.professionalProfileId !== user.professionalProfileId) {
    return { error: "Acesso negado", status: 403 } as const
  }
  return { rec } as const
}

export const PATCH = withFeatureAuth(
  { feature: "todos", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const check = await loadAndCheck(params.id, user)
    if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: "Corpo invalido" }, { status: 400 }) }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 })
    }
    const data = parsed.data

    const updated = await prisma.$transaction(async (tx) => {
      const rec = await tx.todoRecurrence.update({
        where: { id: params.id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      })
      // Cascade title/notes changes to undone child todos in the future
      if (data.title !== undefined || data.notes !== undefined) {
        await tx.todo.updateMany({
          where: { recurrenceId: rec.id, done: false, day: { gte: new Date() } },
          data: {
            ...(data.title !== undefined && { title: data.title }),
            ...(data.notes !== undefined && { notes: data.notes }),
          },
        })
      }
      return rec
    })

    return NextResponse.json({ recurrence: updated })
  }
)

/**
 * DELETE /api/todos/recurrences/:id
 * Deactivates the series and removes future undone occurrences. Past and done
 * occurrences are kept as historical record.
 */
export const DELETE = withFeatureAuth(
  { feature: "todos", minAccess: "WRITE" },
  async (_req, { user }, params) => {
    const check = await loadAndCheck(params.id, user)
    if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status })

    await prisma.$transaction(async (tx) => {
      await tx.todoRecurrence.update({
        where: { id: params.id },
        data: { isActive: false },
      })
      await tx.todo.deleteMany({
        where: { recurrenceId: params.id, done: false, day: { gte: new Date() } },
      })
    })

    return NextResponse.json({ ok: true })
  }
)
