import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api/with-auth"

/**
 * GET /api/intake-submissions — List intake submissions for the clinic
 * Query params: status (PENDING|APPROVED|REJECTED), search, page, limit
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const status = url.searchParams.get("status") || "PENDING"
    const search = url.searchParams.get("search") || ""
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1)
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20") || 20))
    const skip = (page - 1) * limit

    const where = {
      clinicId: user.clinicId,
      ...(status !== "ALL" && { status: status as "PENDING" | "APPROVED" | "REJECTED" }),
      ...(search && {
        OR: [
          { childName: { contains: search, mode: "insensitive" as const } },
          { guardianName: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
        ],
      }),
    }

    const [submissions, total] = await Promise.all([
      prisma.intakeSubmission.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          childName: true,
          guardianName: true,
          phone: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          patientId: true,
        },
      }),
      prisma.intakeSubmission.count({ where }),
    ])

    return NextResponse.json({
      submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  }
)
