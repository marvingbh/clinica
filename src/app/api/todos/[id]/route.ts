import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma, Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { parseDay } from "@/lib/todos"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida (YYYY-MM-DD)")

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional().nullable(),
  day: isoDate.optional(),
  professionalProfileId: z.string().min(1).optional(),
  done: z.boolean().optional(),
  order: z.number().int().optional(),
})

async function loadAndAuthorize(id: string, clinicId: string) {
  const todo = await prisma.todo.findFirst({ where: { id, clinicId } })
  return todo
}

export const GET = withFeatureAuth(
  { feature: "todos", minAccess: "READ" },
  async (_req, { user }, params) => {
    const todo = await loadAndAuthorize(params.id, user.clinicId)
    if (!todo) return NextResponse.json({ error: "Tarefa nao encontrada" }, { status: 404 })
    if (user.role !== Role.ADMIN && todo.professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }
    return NextResponse.json({ todo })
  }
)

export const PATCH = withFeatureAuth(
  { feature: "todos", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const todo = await loadAndAuthorize(params.id, user.clinicId)
    if (!todo) return NextResponse.json({ error: "Tarefa nao encontrada" }, { status: 404 })
    if (user.role !== Role.ADMIN && todo.professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: "Corpo invalido" }, { status: 400 }) }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 })
    }
    const data = parsed.data

    // Professionals cannot reassign to someone else
    if (
      user.role !== Role.ADMIN &&
      data.professionalProfileId &&
      data.professionalProfileId !== user.professionalProfileId
    ) {
      return NextResponse.json({ error: "Voce so pode atribuir a si mesmo" }, { status: 403 })
    }

    // Cross-tenant guard: an admin reassigning the todo MUST land on a
    // professional that belongs to this clinic, otherwise we'd silently corrupt
    // the FK across tenants.
    if (data.professionalProfileId && data.professionalProfileId !== todo.professionalProfileId) {
      const prof = await prisma.professionalProfile.findFirst({
        where: { id: data.professionalProfileId, user: { clinicId: user.clinicId } },
        select: { id: true },
      })
      if (!prof) return NextResponse.json({ error: "Responsavel invalido" }, { status: 400 })
    }

    const updateData: Prisma.TodoUpdateInput = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.day !== undefined) updateData.day = parseDay(data.day)
    if (data.professionalProfileId !== undefined) {
      updateData.professionalProfile = { connect: { id: data.professionalProfileId } }
    }
    if (data.order !== undefined) updateData.order = data.order
    if (data.done !== undefined) {
      updateData.done = data.done
      updateData.doneAt = data.done ? new Date() : null
    }

    const updated = await prisma.todo.update({ where: { id: params.id }, data: updateData })
    return NextResponse.json({ todo: updated })
  }
)

export const DELETE = withFeatureAuth(
  { feature: "todos", minAccess: "WRITE" },
  async (_req, { user }, params) => {
    const todo = await loadAndAuthorize(params.id, user.clinicId)
    if (!todo) return NextResponse.json({ error: "Tarefa nao encontrada" }, { status: 404 })
    if (user.role !== Role.ADMIN && todo.professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    await prisma.todo.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  }
)
