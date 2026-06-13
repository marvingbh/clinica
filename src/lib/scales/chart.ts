import type { ScaleCode, ScaleDefinition } from "./types"

/** A single point on a scale trajectory. */
export interface TrajectoryPoint {
  date: Date
  totalScore: number
  severityLabel: string
}

interface AdministrationLike {
  status: string
  completedAt: Date | string | null
  totalScore: number | null
  severityLabel: string | null
  scaleCode: string
}

/**
 * Builds the time series for one scale: only CONCLUIDA administrations with a
 * non-null score and matching code, ordered by completedAt ascending.
 */
export function buildTrajectorySeries(
  administrations: AdministrationLike[],
  scaleCode: ScaleCode
): TrajectoryPoint[] {
  return administrations
    .filter(
      (a) =>
        a.status === "CONCLUIDA" &&
        a.scaleCode === scaleCode &&
        a.totalScore !== null &&
        a.completedAt !== null
    )
    .map((a) => ({
      date: new Date(a.completedAt as Date | string),
      totalScore: a.totalScore as number,
      severityLabel: a.severityLabel ?? "",
    }))
    .sort((x, y) => x.date.getTime() - y.date.getTime())
}

/** A shaded severity band for the trajectory chart (recharts ReferenceArea). */
export interface SeverityArea {
  y1: number
  y2: number
  label: string
  color: string
}

/** Maps a definition's severity bands to chart reference areas. */
export function buildSeverityAreas(def: ScaleDefinition): SeverityArea[] {
  return def.severityBands.map((b) => ({
    y1: b.min,
    y2: b.max,
    label: b.label,
    color: b.color,
  }))
}
