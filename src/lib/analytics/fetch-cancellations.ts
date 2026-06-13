import { prisma } from "@/lib/prisma"
import type { ReportScope, ProfSlim } from "./fetch-shared"
import { fetchProfessionals } from "./fetch-shared"
import {
  cancellationBreakdown,
  cancellationHeatmap,
  type CancellationBreakdown,
  type HeatmapCell,
  type ApptStatusSlim,
} from "./cancellations"

interface ApptRow {
  status: string
  scheduledAt: Date
  professionalProfileId: string
  attendingProfessionalId: string | null
}

function attributedProf(a: ApptRow): string {
  return a.attendingProfessionalId ?? a.professionalProfileId
}

export interface CancellationsPayload {
  totals: CancellationBreakdown
  byProfessional: Array<{ professionalProfileId: string; name: string } & CancellationBreakdown>
  heatmap: HeatmapCell[]
}

export async function fetchCancellations(scope: ReportScope): Promise<CancellationsPayload> {
  const { clinicId, professionalProfileId, range } = scope

  const profs = await fetchProfessionals(scope)
  const profById = new Map<string, ProfSlim>(profs.map((p) => [p.id, p]))

  const appts = await prisma.appointment.findMany({
    where: { clinicId, type: "CONSULTA", scheduledAt: { gte: range.start, lt: range.end } },
    select: {
      status: true,
      scheduledAt: true,
      professionalProfileId: true,
      attendingProfessionalId: true,
    },
  })

  const scoped = professionalProfileId
    ? appts.filter((a) => attributedProf(a) === professionalProfileId)
    : appts

  const all: ApptStatusSlim[] = scoped.map((a) => ({ status: a.status, scheduledAt: a.scheduledAt }))
  const totals = cancellationBreakdown(all)
  const heatmap = cancellationHeatmap(all)

  const byProfMap = new Map<string, ApptStatusSlim[]>()
  for (const a of scoped) {
    const id = attributedProf(a)
    const list = byProfMap.get(id) || []
    list.push({ status: a.status, scheduledAt: a.scheduledAt })
    byProfMap.set(id, list)
  }

  const byProfessional = [...byProfMap.entries()]
    .map(([id, list]) => ({
      professionalProfileId: id,
      name: profById.get(id)?.name ?? "—",
      ...cancellationBreakdown(list),
    }))
    .sort((a, b) => b.cancelled - a.cancelled)

  return { totals, byProfessional, heatmap }
}
