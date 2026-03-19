import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/public/intake/[slug]/logo — Serve clinic logo publicly for intake form
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: { logoData: true, logoMime: true, isActive: true },
  })

  if (!clinic?.isActive || !clinic.logoData) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(clinic.logoData, {
    headers: {
      "Content-Type": clinic.logoMime || "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
