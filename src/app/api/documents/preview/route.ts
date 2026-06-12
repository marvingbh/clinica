import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import type { AuthUser } from "@/lib/rbac/types"
import { generationBodySchema } from "../_lib/schema"
import { buildGeneration } from "../_lib/build-generation"
import { canAccessPatientDocuments } from "../_lib/scope"
import type { DocumentType } from "@/lib/documents"

export const POST = withFeatureAuth(
  { feature: "documents", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const parsed = generationBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    if (!(await canAccessPatientDocuments(user, parsed.data.patientId))) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    const result = await buildGeneration(user, {
      ...parsed.data,
      templateType: parsed.data.templateType as DocumentType,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      content: result.content,
      sessionRows: result.sessionRows,
      missingFields: result.missingFields,
    })
  }
)
