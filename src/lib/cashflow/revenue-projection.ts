/**
 * Project future revenue from scheduled appointments.
 */

interface AppointmentForProjection {
  id: string
  scheduledAt: Date
  price: number | null
  type: string
  status: string
  patientId: string | null
  professionalProfileId: string
  attendingProfessionalId: string | null
  groupId: string | null
  sessionGroupId: string | null
}

interface PatientFee {
  id: string
  sessionFee: number | null
}

interface ProfessionalInfo {
  id: string
  repassePercentage: number
}

export interface RevenueProjection {
  totalAppointments: number
  grossRevenue: number
  cancellationRate: number
  projectedRevenue: number
  byProfessional: {
    professionalId: string
    appointments: number
    grossRevenue: number
    projectedRevenue: number
    estimatedRepasse: number
  }[]
  totalEstimatedRepasse: number
}

/**
 * Calculate clinic-wide cancellation rate from historical appointments.
 * Uses last 6 months of CONSULTA appointments.
 */
export function calculateCancellationRate(
  appointments: { status: string; type: string }[]
): number {
  const consultas = appointments.filter((a) => a.type === "CONSULTA")
  if (consultas.length === 0) return 0

  const cancelled = consultas.filter((a) =>
    ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"].includes(a.status)
  )

  return Math.round((cancelled.length / consultas.length) * 1000) / 1000
}

/**
 * Project revenue from a list of future appointments.
 *
 * @param appointments - scheduled/confirmed appointments in the projection window
 * @param patientFees - map of patientId → sessionFee
 * @param professionals - map of professionalId → repassePercentage
 * @param cancellationRate - clinic-wide cancellation rate (0-1)
 * @param clinicTaxPercentage - clinic tax % (0-100)
 */
export function projectRevenue(
  appointments: AppointmentForProjection[],
  patientFees: Map<string, number>,
  professionals: Map<string, ProfessionalInfo>,
  cancellationRate: number,
  clinicTaxPercentage: number
): RevenueProjection {
  // Only billable types and statuses
  const billable = appointments.filter(
    (a) =>
      ["CONSULTA", "REUNIAO"].includes(a.type) &&
      ["AGENDADO", "CONFIRMADO"].includes(a.status)
  )

  // Calculate gross revenue per appointment
  let grossRevenue = 0
  const byProfessional = new Map<string, { appointments: number; grossRevenue: number }>()

  for (const apt of billable) {
    const fee = apt.price ?? (apt.patientId ? patientFees.get(apt.patientId) ?? 0 : 0)
    grossRevenue += fee

    const profId = apt.attendingProfessionalId ?? apt.professionalProfileId
    const existing = byProfessional.get(profId)
    if (existing) {
      existing.appointments++
      existing.grossRevenue += fee
    } else {
      byProfessional.set(profId, { appointments: 1, grossRevenue: fee })
    }
  }

  // Apply cancellation discount
  const projectedRevenue = round2(grossRevenue * (1 - cancellationRate))

  // Estimate repasse per professional
  const taxMultiplier = 1 - clinicTaxPercentage / 100
  const profResults = Array.from(byProfessional.entries()).map(([profId, data]) => {
    const prof = professionals.get(profId)
    const projectedProfRevenue = round2(data.grossRevenue * (1 - cancellationRate))
    const afterTax = round2(projectedProfRevenue * taxMultiplier)
    const estimatedRepasse = prof ? round2(afterTax * (prof.repassePercentage / 100)) : 0

    return {
      professionalId: profId,
      appointments: data.appointments,
      grossRevenue: data.grossRevenue,
      projectedRevenue: projectedProfRevenue,
      estimatedRepasse,
    }
  })

  const totalEstimatedRepasse = profResults.reduce((sum, p) => sum + p.estimatedRepasse, 0)

  return {
    totalAppointments: billable.length,
    grossRevenue,
    cancellationRate,
    projectedRevenue,
    byProfessional: profResults,
    totalEstimatedRepasse,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
