import { NextResponse } from "next/server"
import { Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

export const POST = withFeatureAuth(
  { feature: "todos", minAccess: "WRITE" },
  async (_req, { user }, params) => {
    const original = await prisma.todo.findFirst({ where: { id: params.id, clinicId: user.clinicId } })
    if (!original) return NextResponse.json({ error: "Tarefa nao encontrada" }, { status: 404 })
    if (user.role !== Role.ADMIN && original.professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const todo = await prisma.todo.create({
      data: {
        clinicId: original.clinicId,
        professionalProfileId: original.professionalProfileId,
        title: `${original.title} (cópia)`,
        notes: original.notes,
        day: original.day,
        done: false,
        order: original.order,
        // Note: duplicates do NOT inherit the recurrence link — they're standalone copies.
      },
    })
    return NextResponse.json({ todo }, { status: 201 })
  }
)
