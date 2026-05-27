/**
 * Repair orphaned invoice items that lost their appointment relationships
 */

import type { Prisma } from "@prisma/client"

interface OrphanedItem {
  id: string
  invoiceId: string
  attendingProfessionalId: string | null
  description: string
  total: number
  createdAt: Date
  invoice: {
    patientId: string
    referenceMonth: number
    referenceYear: number
  }
}

interface CandidateAppointment {
  id: string
  scheduledAt: Date
  status: string
  professionalProfileId: string
  patientId: string
}

export interface RepairResult {
  success: boolean
  orphanedCount: number
  repairedCount: number
  repairs: Array<{
    invoiceItemId: string
    appointmentId: string
    appointmentDate: Date
    confidence: 'high' | 'medium' | 'low'
  }>
  unrepairable: Array<{
    invoiceItemId: string
    reason: string
  }>
}

/**
 * Find and repair orphaned invoice items by matching them to appointments
 */
export async function repairOrphanedInvoiceItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any
): Promise<RepairResult> {
  console.log("🔍 Finding orphaned invoice items...")

  // Find all orphaned invoice items (no appointmentId but have attendingProfessionalId)
  const orphanedItems: OrphanedItem[] = await tx.invoiceItem.findMany({
    where: {
      appointmentId: null,
      attendingProfessionalId: { not: null }
    },
    include: {
      invoice: {
        select: {
          patientId: true,
          referenceMonth: true,
          referenceYear: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  console.log(`Found ${orphanedItems.length} orphaned invoice items`)

  if (orphanedItems.length === 0) {
    return {
      success: true,
      orphanedCount: 0,
      repairedCount: 0,
      repairs: [],
      unrepairable: []
    }
  }

  const repairs: RepairResult['repairs'] = []
  const unrepairable: RepairResult['unrepairable'] = []

  // Process each orphaned item
  for (const item of orphanedItems) {
    console.log(`\nProcessing orphaned item ${item.id}...`)

    try {
      const repair = await findBestAppointmentMatch(tx, item)

      if (repair) {
        // Update the invoice item to link it back to the appointment
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: { appointmentId: repair.appointmentId }
        })

        repairs.push({
          invoiceItemId: item.id,
          appointmentId: repair.appointmentId,
          appointmentDate: repair.appointmentDate,
          confidence: repair.confidence
        })

        console.log(`✅ Repaired: ${item.id} -> ${repair.appointmentId} (${repair.confidence} confidence)`)
      } else {
        unrepairable.push({
          invoiceItemId: item.id,
          reason: 'No suitable appointment found'
        })
        console.log(`❌ Could not repair: ${item.id}`)
      }
    } catch (error) {
      unrepairable.push({
        invoiceItemId: item.id,
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      console.log(`❌ Error repairing ${item.id}:`, error)
    }
  }

  console.log(`\n📊 Repair Summary:`)
  console.log(`   Orphaned items found: ${orphanedItems.length}`)
  console.log(`   Successfully repaired: ${repairs.length}`)
  console.log(`   Could not repair: ${unrepairable.length}`)

  return {
    success: true,
    orphanedCount: orphanedItems.length,
    repairedCount: repairs.length,
    repairs,
    unrepairable
  }
}

/**
 * Find the best appointment match for an orphaned invoice item
 */
async function findBestAppointmentMatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orphanedItem: OrphanedItem
): Promise<{
  appointmentId: string
  appointmentDate: Date
  confidence: 'high' | 'medium' | 'low'
} | null> {

  const { invoice, attendingProfessionalId, createdAt } = orphanedItem
  const { patientId, referenceMonth, referenceYear } = invoice

  // Look for appointments in the invoice month that match the attending professional
  const monthStart = new Date(referenceYear, referenceMonth - 1, 1)
  const monthEnd = new Date(referenceYear, referenceMonth, 0, 23, 59, 59)

  // First, try to find appointments by the attending professional
  let candidates: CandidateAppointment[] = []

  if (attendingProfessionalId) {
    // Look for appointments where this professional is the primary or attending professional
    candidates = await tx.appointment.findMany({
      where: {
        patientId,
        scheduledAt: { gte: monthStart, lte: monthEnd },
        OR: [
          { professionalProfileId: attendingProfessionalId },
          {
            additionalProfessionals: {
              some: { professionalProfileId: attendingProfessionalId }
            }
          }
        ],
        // Exclude appointments that already have invoice items
        invoiceItems: { none: {} }
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        professionalProfileId: true,
        patientId: true
      },
      orderBy: { scheduledAt: 'asc' }
    })
  }

  if (candidates.length === 0) {
    // Fallback: look for any appointments in the invoice month for this patient
    candidates = await tx.appointment.findMany({
      where: {
        patientId,
        scheduledAt: { gte: monthStart, lte: monthEnd },
        invoiceItems: { none: {} }
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        professionalProfileId: true,
        patientId: true
      },
      orderBy: { scheduledAt: 'asc' }
    })
  }

  if (candidates.length === 0) {
    return null
  }

  // Score candidates based on various factors
  const scoredCandidates = candidates.map(apt => {
    let score = 0
    let confidence: 'high' | 'medium' | 'low' = 'low'

    // Factor 1: Professional match
    if (apt.professionalProfileId === attendingProfessionalId) {
      score += 100
      confidence = 'high'
    }

    // Factor 2: Billable status
    const billableStatuses = ['AGENDADO', 'CONFIRMADO', 'FINALIZADO', 'CANCELADO_FALTA', 'CANCELADO_ACORDADO']
    if (billableStatuses.includes(apt.status)) {
      score += 50
      if (confidence === 'low') confidence = 'medium'
    }

    // Factor 3: Date proximity to invoice creation
    const daysDiff = Math.abs((apt.scheduledAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff <= 7) {
      score += 20
    } else if (daysDiff <= 14) {
      score += 10
    }

    // Factor 4: Prefer appointments that happened before the invoice was created
    if (apt.scheduledAt < createdAt) {
      score += 10
    }

    return {
      ...apt,
      score,
      confidence
    }
  })

  // Sort by score (highest first)
  scoredCandidates.sort((a, b) => b.score - a.score)

  const best = scoredCandidates[0]

  // Only return matches with a reasonable score
  if (best.score < 50) {
    return null
  }

  return {
    appointmentId: best.id,
    appointmentDate: best.scheduledAt,
    confidence: best.confidence
  }
}