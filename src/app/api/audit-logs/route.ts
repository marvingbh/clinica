import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { computeChanges } from "@/lib/audit/field-labels"

/**
 * GET /api/audit-logs
 * Get audit logs for a specific entity (admin only).
 *
 * Query params:
 * - entityType (required): "Patient" | "Appointment" | "AppointmentRecurrence"
 * - entityId (required): the entity's ID
 * - page (default 1)
 * - limit (default 20, max 50)
 */
export const GET = withFeatureAuth(
  { feature: "audit_logs", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)

    const entityType = searchParams.get("entityType")
    const entityId = searchParams.get("entityId")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)))

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "entityType and entityId are required" },
        { status: 400 }
      )
    }

    const where = {
      clinicId: user.clinicId,
      entityType,
      entityId,
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const entries = logs.map((log) => ({
      id: log.id,
      action: log.action,
      userName: log.user?.name || "Sistema",
      createdAt: log.createdAt.toISOString(),
      changes: computeChanges(
        log.oldValues as Record<string, unknown> | null,
        log.newValues as Record<string, unknown> | null
      ),
      isCreate: !log.oldValues || Object.keys(log.oldValues as object).length === 0,
    }))

    return NextResponse.json({
      entries,
      pagination: { page, limit, total },
    })
  }
)
