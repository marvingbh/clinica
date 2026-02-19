import { NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { resetTemplateToDefault } from "@/lib/notifications"
import { NotificationChannel, NotificationType } from "@prisma/client"

const resetSchema = z.object({
  type: z.nativeEnum(NotificationType),
  channel: z.nativeEnum(NotificationChannel),
})

/**
 * POST /api/admin/notification-templates/reset
 * Resets a template to default by deleting the custom version
 */
export const POST = withFeatureAuth(
  { feature: "notifications", minAccess: "WRITE" },
  async (req, { user }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    const parsed = resetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { type, channel } = parsed.data

    await resetTemplateToDefault(user.clinicId, type, channel)

    return NextResponse.json({ success: true })
  }
)
