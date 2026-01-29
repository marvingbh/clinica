import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"

/**
 * GET /api/admin/audit-logs
 * List audit logs with filters - ADMIN only
 *
 * Query parameters:
 * - action: Filter by action type (e.g., "APPOINTMENT_CREATED", "LOGIN_SUCCESS")
 * - entityType: Filter by entity type (e.g., "Appointment", "Patient", "User")
 * - entityId: Filter by specific entity ID
 * - userId: Filter by user who performed the action
 * - startDate: Filter by date range start (ISO 8601)
 * - endDate: Filter by date range end (ISO 8601)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 */
export const GET = withAuth(
  { resource: "audit-log", action: "list" },
  async (req, { user, scope }) => {
    // Only ADMIN can view audit logs (clinic scope required)
    if (scope !== "clinic") {
      return forbiddenResponse("Apenas administradores podem visualizar logs de auditoria")
    }

    const { searchParams } = new URL(req.url)

    // Parse query parameters
    const action = searchParams.get("action")
    const entityType = searchParams.get("entityType")
    const entityId = searchParams.get("entityId")
    const userId = searchParams.get("userId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)))

    // Build where clause
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (action) {
      where.action = action
    }

    if (entityType) {
      where.entityType = entityType
    }

    if (entityId) {
      where.entityId = entityId
    }

    if (userId) {
      where.userId = userId
    }

    // Date range filter (parse as local time by appending time component)
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        ;(where.createdAt as Record<string, Date>).gte = new Date(startDate + "T00:00:00")
      }
      if (endDate) {
        ;(where.createdAt as Record<string, Date>).lte = new Date(endDate + "T23:59:59.999")
      }
    }

    // Get total count for pagination
    const totalCount = await prisma.auditLog.count({ where })

    // Fetch audit logs with user info
    const auditLogs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
    })

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)

    return NextResponse.json({
      auditLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    })
  }
)
