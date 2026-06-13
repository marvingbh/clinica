import { describe, it, expect } from "vitest"
import { buildTrajectorySeries, buildSeverityAreas } from "./chart"
import { PHQ9_DEFINITION } from "./definitions"

describe("buildTrajectorySeries", () => {
  const admins = [
    {
      status: "CONCLUIDA",
      completedAt: "2026-05-01T10:00:00Z",
      totalScore: 12,
      severityLabel: "Moderado",
      scaleCode: "PHQ9",
    },
    {
      status: "CONCLUIDA",
      completedAt: "2026-04-01T10:00:00Z",
      totalScore: 18,
      severityLabel: "Moderadamente grave",
      scaleCode: "PHQ9",
    },
    // different scale — excluded
    {
      status: "CONCLUIDA",
      completedAt: "2026-04-15T10:00:00Z",
      totalScore: 9,
      severityLabel: "Leve",
      scaleCode: "GAD7",
    },
    // not completed — excluded
    {
      status: "ENVIADA",
      completedAt: null,
      totalScore: null,
      severityLabel: null,
      scaleCode: "PHQ9",
    },
    // completed but null score — excluded defensively
    {
      status: "CONCLUIDA",
      completedAt: "2026-03-01T10:00:00Z",
      totalScore: null,
      severityLabel: null,
      scaleCode: "PHQ9",
    },
  ]

  it("keeps only completed PHQ9 points with a score, ordered ascending", () => {
    const series = buildTrajectorySeries(admins, "PHQ9")
    expect(series).toHaveLength(2)
    expect(series[0].totalScore).toBe(18) // April first (earlier)
    expect(series[1].totalScore).toBe(12) // May second
    expect(series[0].date.getTime()).toBeLessThan(series[1].date.getTime())
  })

  it("filters by scale code", () => {
    expect(buildTrajectorySeries(admins, "GAD7").map((p) => p.totalScore)).toEqual([9])
  })

  it("returns an empty series when nothing matches", () => {
    expect(buildTrajectorySeries([], "PHQ9")).toEqual([])
  })
})

describe("buildSeverityAreas", () => {
  it("mirrors the definition bands", () => {
    const areas = buildSeverityAreas(PHQ9_DEFINITION)
    expect(areas).toHaveLength(PHQ9_DEFINITION.severityBands.length)
    expect(areas[0]).toEqual({
      y1: 0,
      y2: 4,
      label: "Mínimo",
      color: PHQ9_DEFINITION.severityBands[0].color,
    })
    expect(areas[areas.length - 1].y2).toBe(27)
  })
})
