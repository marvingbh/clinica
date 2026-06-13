import { prisma } from "@/lib/prisma"
import type { DateRange } from "./types"
import type { AvailabilityRuleSlim, AvailabilityExceptionSlim } from "./occupancy"

export interface ReportScope {
  clinicId: string
  /** When set, restrict every query to this professional (own-scope or ADMIN filter). */
  professionalProfileId: string | null
  range: DateRange
}

export interface ProfSlim {
  id: string
  name: string
}

/** Active professionals of the clinic, optionally narrowed to one. */
export async function fetchProfessionals(scope: ReportScope): Promise<ProfSlim[]> {
  const profs = await prisma.professionalProfile.findMany({
    where: {
      user: { clinicId: scope.clinicId, isActive: true },
      ...(scope.professionalProfileId ? { id: scope.professionalProfileId } : {}),
    },
    select: { id: true, user: { select: { name: true } } },
  })
  return profs
    .map((p) => ({ id: p.id, name: p.user.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/**
 * Availability rules + exceptions per professional (including clinic-wide
 * exceptions, which apply to everyone). Returns maps keyed by professionalId.
 */
export async function fetchAvailability(scope: ReportScope, profIds: string[]): Promise<{
  rulesByProf: Map<string, AvailabilityRuleSlim[]>
  exceptionsByProf: Map<string, AvailabilityExceptionSlim[]>
}> {
  const rulesByProf = new Map<string, AvailabilityRuleSlim[]>()
  const exceptionsByProf = new Map<string, AvailabilityExceptionSlim[]>()
  if (profIds.length === 0) {
    return { rulesByProf, exceptionsByProf }
  }

  const rules = await prisma.availabilityRule.findMany({
    where: { professionalProfileId: { in: profIds } },
    select: { professionalProfileId: true, dayOfWeek: true, startTime: true, endTime: true, isActive: true },
  })
  for (const r of rules) {
    const list = rulesByProf.get(r.professionalProfileId) || []
    list.push({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, isActive: r.isActive })
    rulesByProf.set(r.professionalProfileId, list)
  }

  // Per-professional exceptions.
  const perProf = await prisma.availabilityException.findMany({
    where: { professionalProfileId: { in: profIds } },
    select: {
      professionalProfileId: true,
      date: true,
      dayOfWeek: true,
      isRecurring: true,
      isAvailable: true,
      startTime: true,
      endTime: true,
    },
  })

  // Clinic-wide exceptions (no professional) — apply to all.
  const clinicWide = await prisma.availabilityException.findMany({
    where: { clinicId: scope.clinicId, professionalProfileId: null },
    select: {
      date: true,
      dayOfWeek: true,
      isRecurring: true,
      isAvailable: true,
      startTime: true,
      endTime: true,
    },
  })

  const toSlim = (e: {
    date: Date | null
    dayOfWeek: number | null
    isRecurring: boolean
    isAvailable: boolean
    startTime: string | null
    endTime: string | null
  }): AvailabilityExceptionSlim => ({
    date: e.date,
    dayOfWeek: e.dayOfWeek,
    isRecurring: e.isRecurring,
    isAvailable: e.isAvailable,
    startTime: e.startTime,
    endTime: e.endTime,
  })

  for (const id of profIds) {
    exceptionsByProf.set(id, clinicWide.map(toSlim))
  }
  for (const e of perProf) {
    if (!e.professionalProfileId) continue
    const list = exceptionsByProf.get(e.professionalProfileId) || []
    list.push(toSlim(e))
    exceptionsByProf.set(e.professionalProfileId, list)
  }

  return { rulesByProf, exceptionsByProf }
}
