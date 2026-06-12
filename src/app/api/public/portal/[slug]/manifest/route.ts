import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/public/portal/[slug]/manifest
 * Dynamic PWA manifest scoped to the patient portal so installing it does not
 * affect the staff PWA (scope "/").
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: { name: true, isActive: true },
  })

  const name = clinic && clinic.isActive ? `${clinic.name} — Área do Paciente` : "Área do Paciente"

  const manifest = {
    name,
    short_name: "Área do Paciente",
    description: "Acesse suas sessões, faturas e dados com a sua clínica.",
    start_url: `/paciente/${slug}`,
    scope: `/paciente/${slug}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  }

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  })
}
