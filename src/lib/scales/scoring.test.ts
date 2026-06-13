import { describe, it, expect } from "vitest"
import {
  validateAnswers,
  mergeAnswers,
  isComplete,
  getProgress,
  scoreScale,
  getSeverityBand,
  detectRisk,
  ScaleValidationError,
  IncompleteAnswersError,
} from "./scoring"
import { PHQ9_DEFINITION, GAD7_DEFINITION } from "./definitions"
import type { ScaleDefinition } from "./types"

function allAnswers(def: ScaleDefinition, value: number): Record<string, number> {
  return Object.fromEntries(def.items.map((i) => [i.id, value]))
}

describe("validateAnswers", () => {
  it("accepts a valid full map", () => {
    const answers = allAnswers(PHQ9_DEFINITION, 2)
    expect(validateAnswers(PHQ9_DEFINITION, answers)).toEqual(answers)
  })

  it("accepts a valid subset (partial autosave)", () => {
    expect(validateAnswers(PHQ9_DEFINITION, { item1: 1, item3: 0 })).toEqual({
      item1: 1,
      item3: 0,
    })
  })

  it("rejects an unknown item id", () => {
    expect(() => validateAnswers(PHQ9_DEFINITION, { item99: 1 })).toThrow(ScaleValidationError)
  })

  it("rejects a value outside the option domain", () => {
    expect(() => validateAnswers(PHQ9_DEFINITION, { item1: 4 })).toThrow(ScaleValidationError)
    expect(() => validateAnswers(PHQ9_DEFINITION, { item1: -1 })).toThrow(ScaleValidationError)
  })

  it("rejects a non-integer / non-number value", () => {
    expect(() => validateAnswers(PHQ9_DEFINITION, { item1: 1.5 })).toThrow(ScaleValidationError)
    expect(() => validateAnswers(PHQ9_DEFINITION, { item1: "2" })).toThrow(ScaleValidationError)
  })

  it("rejects a non-object payload", () => {
    expect(() => validateAnswers(PHQ9_DEFINITION, null)).toThrow(ScaleValidationError)
    expect(() => validateAnswers(PHQ9_DEFINITION, [1, 2])).toThrow(ScaleValidationError)
  })
})

describe("mergeAnswers", () => {
  it("merges with the patch winning", () => {
    expect(mergeAnswers({ item1: 1, item2: 2 }, { item2: 3, item3: 0 })).toEqual({
      item1: 1,
      item2: 3,
      item3: 0,
    })
  })
})

describe("isComplete / getProgress", () => {
  it("isComplete is false for empty, partial; true for full", () => {
    expect(isComplete(GAD7_DEFINITION, {})).toBe(false)
    expect(isComplete(GAD7_DEFINITION, { item1: 0, item2: 1 })).toBe(false)
    expect(isComplete(GAD7_DEFINITION, allAnswers(GAD7_DEFINITION, 0))).toBe(true)
  })

  it("getProgress reports answered/total and the next unanswered index", () => {
    expect(getProgress(GAD7_DEFINITION, {})).toEqual({
      answered: 0,
      total: 7,
      nextItemIndex: 0,
    })
    expect(getProgress(GAD7_DEFINITION, { item1: 1, item2: 0 })).toEqual({
      answered: 2,
      total: 7,
      nextItemIndex: 2,
    })
    expect(getProgress(GAD7_DEFINITION, allAnswers(GAD7_DEFINITION, 1))).toEqual({
      answered: 7,
      total: 7,
      nextItemIndex: 7,
    })
  })

  it("getProgress finds the first gap even when later items are answered", () => {
    // item1 missing, item2 answered
    expect(getProgress(GAD7_DEFINITION, { item2: 1 }).nextItemIndex).toBe(0)
  })
})

describe("scoreScale — PHQ-9", () => {
  it("all 1s ⇒ 9, 'Leve'", () => {
    const r = scoreScale(PHQ9_DEFINITION, allAnswers(PHQ9_DEFINITION, 1))
    expect(r.totalScore).toBe(9)
    expect(r.severityLabel).toBe("Leve")
    expect(r.riskFlag).toBe(true) // item9 = 1
  })

  it("all 0s ⇒ 0, 'Mínimo', no risk", () => {
    const r = scoreScale(PHQ9_DEFINITION, allAnswers(PHQ9_DEFINITION, 0))
    expect(r.totalScore).toBe(0)
    expect(r.severityLabel).toBe("Mínimo")
    expect(r.riskFlag).toBe(false)
  })

  it("all 3s ⇒ 27, 'Grave'", () => {
    const r = scoreScale(PHQ9_DEFINITION, allAnswers(PHQ9_DEFINITION, 3))
    expect(r.totalScore).toBe(27)
    expect(r.severityLabel).toBe("Grave")
  })

  it("throws IncompleteAnswersError on a partial map", () => {
    expect(() => scoreScale(PHQ9_DEFINITION, { item1: 1 })).toThrow(IncompleteAnswersError)
  })
})

describe("getSeverityBand — PHQ-9 boundaries", () => {
  const cases: Array<[number, string]> = [
    [4, "Mínimo"],
    [5, "Leve"],
    [9, "Leve"],
    [10, "Moderado"],
    [14, "Moderado"],
    [15, "Moderadamente grave"],
    [19, "Moderadamente grave"],
    [20, "Grave"],
    [27, "Grave"],
  ]
  for (const [score, label] of cases) {
    it(`score ${score} ⇒ ${label}`, () => {
      expect(getSeverityBand(PHQ9_DEFINITION, score).label).toBe(label)
    })
  }
})

describe("getSeverityBand — GAD-7 boundaries", () => {
  const cases: Array<[number, string]> = [
    [0, "Mínima"],
    [4, "Mínima"],
    [5, "Leve"],
    [9, "Leve"],
    [10, "Moderada"],
    [14, "Moderada"],
    [15, "Grave"],
    [21, "Grave"],
  ]
  for (const [score, label] of cases) {
    it(`score ${score} ⇒ ${label}`, () => {
      expect(getSeverityBand(GAD7_DEFINITION, score).label).toBe(label)
    })
  }
})

describe("detectRisk", () => {
  it("PHQ-9 item9 = 0 ⇒ no risk", () => {
    const r = detectRisk(PHQ9_DEFINITION, { ...allAnswers(PHQ9_DEFINITION, 0) })
    expect(r.riskFlag).toBe(false)
    expect(r.endorsedRiskItemIds).toEqual([])
  })

  it("PHQ-9 item9 in 1..3 ⇒ risk + ids", () => {
    for (const v of [1, 2, 3]) {
      const answers = { ...allAnswers(PHQ9_DEFINITION, 0), item9: v }
      const r = detectRisk(PHQ9_DEFINITION, answers)
      expect(r.riskFlag).toBe(true)
      expect(r.endorsedRiskItemIds).toEqual(["item9"])
    }
  })

  it("detects risk on a partial map (item9 answered, others not)", () => {
    const r = detectRisk(PHQ9_DEFINITION, { item9: 2 })
    expect(r.riskFlag).toBe(true)
  })

  it("GAD-7 never flags risk", () => {
    const r = detectRisk(GAD7_DEFINITION, allAnswers(GAD7_DEFINITION, 3))
    expect(r.riskFlag).toBe(false)
  })
})

describe("scoreScale — reverse-item support (synthetic scale)", () => {
  const REVERSE_SCALE: ScaleDefinition = {
    code: "PHQ9", // code unused in pure scoring
    version: 99,
    name: "Synthetic",
    shortName: "SYN",
    stem: "test",
    options: [
      { value: 0, label: "a" },
      { value: 1, label: "b" },
      { value: 2, label: "c" },
      { value: 3, label: "d" },
    ],
    maxScore: 6,
    items: [
      { id: "q1", text: "normal" },
      { id: "q2", text: "reverse", reverse: true },
    ],
    severityBands: [
      { min: 0, max: 3, label: "Baixo", color: "" },
      { min: 4, max: 6, label: "Alto", color: "" },
    ],
    riskItemIds: [],
  }

  it("inverts a reverse item (maxValue - v)", () => {
    // q1=2 stays 2; q2=1 becomes 3-1=2 ⇒ total 4
    const r = scoreScale(REVERSE_SCALE, { q1: 2, q2: 1 })
    expect(r.totalScore).toBe(4)
    expect(r.severityLabel).toBe("Alto")
  })

  it("a reverse item answered 0 contributes the max", () => {
    // q1=0; q2=0 becomes 3 ⇒ total 3
    expect(scoreScale(REVERSE_SCALE, { q1: 0, q2: 0 }).totalScore).toBe(3)
  })
})
