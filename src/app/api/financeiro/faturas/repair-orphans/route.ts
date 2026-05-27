import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { repairOrphanedInvoiceItems } from "@/lib/financeiro/repair-orphaned-invoice-items"
import { audit, AuditAction } from "@/lib/rbac/audit"

/**
 * POST /api/financeiro/faturas/repair-orphans
 * Repair orphaned invoice items that lost their appointment relationships
 */
export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    try {
      console.log("🚑 Starting orphaned invoice items repair...")

      const result = await prisma.$transaction(async (tx) => {
        return await repairOrphanedInvoiceItems(tx)
      }, { timeout: 60000 }) // 1 minute timeout

      // Log the repair operation
      await audit.log({
        user,
        action: AuditAction.INVOICE_ITEM_UPDATED,
        entityType: "InvoiceItem",
        entityId: "bulk-repair",
        newValues: {
          orphanedCount: result.orphanedCount,
          repairedCount: result.repairedCount,
          unreparableCount: result.unrepairable.length,
          repairs: result.repairs.map(r => ({
            itemId: r.invoiceItemId,
            appointmentId: r.appointmentId,
            confidence: r.confidence
          }))
        },
        request: req
      }).catch(() => {})

      console.log("✅ Repair operation completed")

      return NextResponse.json({
        message: `Repaired ${result.repairedCount} of ${result.orphanedCount} orphaned invoice items`,
        ...result
      })

    } catch (error) {
      console.error("❌ Error during orphan repair:", error)

      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        message: "Failed to repair orphaned invoice items"
      }, { status: 500 })
    }
  }
)

/**
 * GET /api/financeiro/faturas/repair-orphans
 * Check for orphaned invoice items without repairing them
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    try {
      console.log("🔍 Checking for orphaned invoice items...")

      const orphanedItems = await prisma.invoiceItem.findMany({
        where: {
          appointmentId: null,
          attendingProfessionalId: { not: null },
          invoice: { clinicId: user.clinicId }
        },
        include: {
          invoice: {
            select: {
              id: true,
              status: true,
              referenceMonth: true,
              referenceYear: true,
              patient: {
                select: { name: true }
              }
            }
          },
          attendingProfessional: {
            select: {
              user: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 100 // Limit to prevent overwhelming responses
      })

      console.log(`Found ${orphanedItems.length} orphaned items`)

      const summary = {
        totalOrphaned: orphanedItems.length,
        byMonth: {} as Record<string, number>,
        byProfessional: {} as Record<string, number>,
        byStatus: {} as Record<string, number>
      }

      orphanedItems.forEach(item => {
        const monthKey = `${item.invoice.referenceYear}-${String(item.invoice.referenceMonth).padStart(2, '0')}`
        summary.byMonth[monthKey] = (summary.byMonth[monthKey] || 0) + 1

        const profName = item.attendingProfessional?.user.name || 'Unknown'
        summary.byProfessional[profName] = (summary.byProfessional[profName] || 0) + 1

        summary.byStatus[item.invoice.status] = (summary.byStatus[item.invoice.status] || 0) + 1
      })

      return NextResponse.json({
        success: true,
        summary,
        items: orphanedItems.map(item => ({
          id: item.id,
          description: item.description,
          total: item.total,
          invoiceId: item.invoice.id,
          invoiceStatus: item.invoice.status,
          patientName: item.invoice.patient.name,
          professionalName: item.attendingProfessional?.user.name,
          referenceMonth: item.invoice.referenceMonth,
          referenceYear: item.invoice.referenceYear,
          createdAt: item.createdAt
        }))
      })

    } catch (error) {
      console.error("❌ Error checking orphaned items:", error)

      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }, { status: 500 })
    }
  }
)