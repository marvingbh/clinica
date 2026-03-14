import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const MAX_SIZE = 512 * 1024 // 512KB
const ALLOWED_TYPES = ["image/png", "image/jpeg"]

/**
 * GET /api/admin/settings/logo
 * Serves the clinic logo image (or 404 if none).
 */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { logoData: true, logoMime: true },
    })

    if (!clinic?.logoData) {
      return NextResponse.json({ error: "Nenhum logo configurado" }, { status: 404 })
    }

    return new NextResponse(clinic.logoData, {
      headers: {
        "Content-Type": clinic.logoMime || "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    })
  }
)

/**
 * POST /api/admin/settings/logo
 * Upload a logo image (multipart/form-data with "file" field).
 */
export const POST = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato inválido. Use PNG ou JPG." },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Máximo 512KB." },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    await prisma.clinic.update({
      where: { id: user.clinicId },
      data: { logoData: buffer, logoMime: file.type },
    })

    return NextResponse.json({ success: true })
  }
)

/**
 * DELETE /api/admin/settings/logo
 * Remove the clinic logo.
 */
export const DELETE = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    await prisma.clinic.update({
      where: { id: user.clinicId },
      data: { logoData: null, logoMime: null },
    })

    return NextResponse.json({ success: true })
  }
)
