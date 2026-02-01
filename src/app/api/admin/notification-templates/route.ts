import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth, forbiddenResponse } from "@/lib/api"
import {
  getTemplatesForClinic,
  upsertTemplate,
  TEMPLATE_VARIABLES,
} from "@/lib/notifications"
import { NotificationChannel, NotificationType } from "@prisma/client"

const updateTemplateSchema = z.object({
  type: z.nativeEnum(NotificationType),
  channel: z.nativeEnum(NotificationChannel),
  name: z.string().min(1, "Nome é obrigatório").max(200),
  subject: z.string().max(500).nullable().optional(),
  content: z.string().min(1, "Conteúdo é obrigatório").max(5000),
  isActive: z.boolean().optional(),
})

/**
 * GET /api/admin/notification-templates
 * Returns all notification templates for the clinic (custom + defaults)
 */
export const GET = withAuth(
  { resource: "notification-template", action: "list" },
  async (req, { user, scope }) => {
    if (scope !== "clinic") {
      return forbiddenResponse("Apenas administradores podem visualizar templates")
    }

    const templates = await getTemplatesForClinic(user.clinicId)

    return NextResponse.json({
      templates,
      variables: TEMPLATE_VARIABLES,
    })
  }
)

/**
 * POST /api/admin/notification-templates
 * Creates or updates a notification template
 */
export const POST = withAuth(
  { resource: "notification-template", action: "update" },
  async (req, { user, scope }) => {
    if (scope !== "clinic") {
      return forbiddenResponse("Apenas administradores podem editar templates")
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

    const parsed = updateTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { type, channel, name, subject, content, isActive } = parsed.data

    // Validate subject is provided for email templates
    if (channel === NotificationChannel.EMAIL && !subject) {
      return NextResponse.json(
        { error: "Assunto é obrigatório para templates de email" },
        { status: 400 }
      )
    }

    const template = await upsertTemplate(user.clinicId, type, channel, {
      name,
      subject: subject ?? null,
      content,
      isActive,
    })

    return NextResponse.json({ template })
  }
)
