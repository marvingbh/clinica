import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { canAccessPatientDocuments } from "../../_lib/scope"
import { documentFileName } from "../../_lib/render-pdf"

export const GET = withFeatureAuth(
  { feature: "documents", minAccess: "READ" },
  async (_req: NextRequest, { user }: { user: AuthUser }, params) => {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { title: true, patientId: true, pdfData: true },
    })
    if (!doc || !doc.pdfData) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }

    if (!(await canAccessPatientDocuments(user, doc.patientId))) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }

    const bytes = Buffer.from(doc.pdfData)
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${documentFileName(doc.title)}"`,
        "Content-Length": String(bytes.length),
      },
    })
  }
)
