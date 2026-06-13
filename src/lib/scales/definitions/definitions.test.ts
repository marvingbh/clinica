import { describe, it, expect } from "vitest"
import {
  SCALE_DEFINITIONS,
  getScaleDefinition,
  isScaleCode,
  listScales,
  PHQ9_DEFINITION,
  GAD7_DEFINITION,
} from "./index"
import type { ScaleDefinition } from "../types"

function assertBandsCoverRange(def: ScaleDefinition) {
  const sorted = [...def.severityBands].sort((a, b) => a.min - b.min)
  // first band starts at 0
  expect(sorted[0].min).toBe(0)
  // last band ends at maxScore
  expect(sorted[sorted.length - 1].max).toBe(def.maxScore)
  // contiguous, no gaps, no overlaps
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i].min).toBe(sorted[i - 1].max + 1)
  }
}

describe("PHQ-9 definition", () => {
  it("has 9 items and a max score of 27", () => {
    expect(PHQ9_DEFINITION.items).toHaveLength(9)
    expect(PHQ9_DEFINITION.maxScore).toBe(27)
  })

  it("has 0..3 frequency options", () => {
    expect(PHQ9_DEFINITION.options.map((o) => o.value)).toEqual([0, 1, 2, 3])
  })

  it("flags item9 as the only risk item", () => {
    expect(PHQ9_DEFINITION.riskItemIds).toEqual(["item9"])
  })

  it("has contiguous bands covering 0..27", () => {
    assertBandsCoverRange(PHQ9_DEFINITION)
  })
})

describe("GAD-7 definition", () => {
  it("has 7 items and a max score of 21", () => {
    expect(GAD7_DEFINITION.items).toHaveLength(7)
    expect(GAD7_DEFINITION.maxScore).toBe(21)
  })

  it("has 0..3 frequency options", () => {
    expect(GAD7_DEFINITION.options.map((o) => o.value)).toEqual([0, 1, 2, 3])
  })

  it("has no risk items", () => {
    expect(GAD7_DEFINITION.riskItemIds).toEqual([])
  })

  it("has contiguous bands covering 0..21", () => {
    assertBandsCoverRange(GAD7_DEFINITION)
  })
})

describe("registry integrity", () => {
  it("riskItemIds are a subset of item ids for every scale", () => {
    for (const def of Object.values(SCALE_DEFINITIONS)) {
      const ids = new Set(def.items.map((i) => i.id))
      for (const riskId of def.riskItemIds) {
        expect(ids.has(riskId)).toBe(true)
      }
    }
  })

  it("each definition's max score equals 3 * itemCount (all 0..3, no reverse)", () => {
    for (const def of Object.values(SCALE_DEFINITIONS)) {
      expect(def.maxScore).toBe(3 * def.items.length)
    }
  })

  it("all item ids within a scale are unique", () => {
    for (const def of Object.values(SCALE_DEFINITIONS)) {
      const ids = def.items.map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe("getScaleDefinition / isScaleCode / listScales", () => {
  it("returns the definition for a known code", () => {
    expect(getScaleDefinition("PHQ9")).toBe(PHQ9_DEFINITION)
    expect(getScaleDefinition("GAD7")).toBe(GAD7_DEFINITION)
  })

  it("throws on an unknown code", () => {
    expect(() => getScaleDefinition("BDI")).toThrow(/desconhecida/i)
  })

  it("isScaleCode narrows known codes", () => {
    expect(isScaleCode("PHQ9")).toBe(true)
    expect(isScaleCode("GAD7")).toBe(true)
    expect(isScaleCode("BAI")).toBe(false)
  })

  it("listScales returns code + names for every scale", () => {
    const list = listScales()
    expect(list).toHaveLength(2)
    expect(list.map((s) => s.code).sort()).toEqual(["GAD7", "PHQ9"])
    expect(list.every((s) => s.name && s.shortName)).toBe(true)
  })
})
