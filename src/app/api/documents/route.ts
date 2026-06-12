import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { documentListScope, canAccessPatientDocuments } from "./_lib/scope"
import type { Prisma } from "@prisma/client"

export const GET = withFeatureAuth(
  { feature: "documents", minAccess: "READ" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const sp = new URL(req.url).searchParams
    const patientId = sp.get("patientId")
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20))

    if (patientId && !(await canAccessPatientDocuments(user, patientId))) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    const where = {
      ...documentListScope(user),
      ...(patientId ? { patientId } : {}),
    } as Prisma.GeneratedDocumentWhereInput

    const [documents, total] = await Promise.all([
      prisma.generatedDocument.findMany({
        where,
        // Never select pdfData in the list.
        select: {
          id: true, title: true, templateType: true, templateName: true,
          createdAt: true, sentToEmail: true, sentAt: true,
          patient: { select: { id: true, name: true } },
          professionalProfile: { select: { user: { select: { name: true } } } },
          generatedByUser: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.generatedDocument.count({ where }),
    ])

    return NextResponse.json({
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        templateType: d.templateType,
        templateName: d.templateName,
        createdAt: d.createdAt.toISOString(),
        sentToEmail: d.sentToEmail,
        sentAt: d.sentAt?.toISOString() ?? null,
        patientName: d.patient.name,
        professionalName: d.professionalProfile?.user.name ?? null,
        generatedByName: d.generatedByUser?.name ?? null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  }
)
