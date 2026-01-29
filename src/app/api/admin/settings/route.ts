import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"

const updateSettingsSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200).optional(),
  timezone: z.string().min(1).max(100).optional(),
  defaultSessionDuration: z
    .number()
    .int()
    .min(15, "Duração mínima é 15 minutos")
    .max(180, "Duração máxima é 180 minutos")
    .optional(),
  minAdvanceBooking: z
    .number()
    .int()
    .min(0, "Valor mínimo é 0 horas")
    .max(168, "Valor máximo é 168 horas (7 dias)")
    .optional(),
  reminderHours: z
    .array(z.number().int().min(0).max(168))
    .max(10, "Máximo de 10 lembretes")
    .optional(),
})

/**
 * GET /api/admin/settings
 * Returns clinic settings - ADMIN only
 */
export const GET = withAuth(
  { resource: "clinic", action: "read" },
  async (req, { user, scope }) => {
    // Only ADMIN can view clinic settings
    if (scope !== "own" && scope !== "clinic") {
      return forbiddenResponse("Apenas administradores podem visualizar configurações")
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: {
        id: true,
        name: true,
        timezone: true,
        defaultSessionDuration: true,
        minAdvanceBooking: true,
        reminderHours: true,
      },
    })

    if (!clinic) {
      return NextResponse.json(
        { error: "Clínica não encontrada" },
        { status: 404 }
      )
    }

    return NextResponse.json({ settings: clinic })
  }
)

/**
 * PATCH /api/admin/settings
 * Updates clinic settings - ADMIN only
 */
export const PATCH = withAuth(
  { resource: "clinic", action: "update" },
  async (req, { user, scope }) => {
    // Only ADMIN can update clinic settings
    if (scope !== "own" && scope !== "clinic") {
      return forbiddenResponse("Apenas administradores podem atualizar configurações")
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    const parsed = updateSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { name, timezone, defaultSessionDuration, minAdvanceBooking, reminderHours } =
      parsed.data

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (timezone !== undefined) updateData.timezone = timezone
    if (defaultSessionDuration !== undefined)
      updateData.defaultSessionDuration = defaultSessionDuration
    if (minAdvanceBooking !== undefined) updateData.minAdvanceBooking = minAdvanceBooking
    if (reminderHours !== undefined) updateData.reminderHours = reminderHours

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo para atualizar" },
        { status: 400 }
      )
    }

    const updatedClinic = await prisma.clinic.update({
      where: { id: user.clinicId },
      data: updateData,
      select: {
        id: true,
        name: true,
        timezone: true,
        defaultSessionDuration: true,
        minAdvanceBooking: true,
        reminderHours: true,
      },
    })

    return NextResponse.json({ settings: updatedClinic })
  }
)
