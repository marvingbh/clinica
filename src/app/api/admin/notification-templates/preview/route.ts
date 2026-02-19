import { NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { previewTemplate } from "@/lib/notifications"

const previewSchema = z.object({
  content: z.string().min(1, "Conteúdo é obrigatório").max(5000),
  subject: z.string().max(500).nullable().optional(),
})

/**
 * POST /api/admin/notification-templates/preview
 * Previews a template with sample data
 */
export const POST = withFeatureAuth(
  { feature: "notifications", minAccess: "READ" },
  async (req) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    const parsed = previewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { content, subject } = parsed.data
    const preview = previewTemplate(content, subject ?? null)

    return NextResponse.json({ preview })
  }
)
