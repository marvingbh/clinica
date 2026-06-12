import { describe, it, expect } from "vitest"
import {
  decideSlotTrigger,
  buildTriageTodoTitle,
  buildBatchTodoTitle,
} from "./slot-events"

const now = new Date("2026-06-15T12:00:00.000Z")
const futureSlot = new Date("2026-06-16T12:00:00.000Z") // 24h ahead

function base() {
  return {
    type: "CONSULTA",
    blocksTime: true,
    scheduledAt: futureSlot,
    now,
    mode: "OFERTA_AUTOMATICA" as const,
    minNoticeHours: 3,
    notificationsEnabled: true,
    batchSize: 1,
  }
}

describe("decideSlotTrigger", () => {
  it("AUTO for a future CONSULTA in automatic mode with gate on", () => {
    expect(decideSlotTrigger(base())).toBe("AUTO")
  })

  it("SKIP for non-CONSULTA types", () => {
    for (const type of ["LEMBRETE", "NOTA", "TAREFA", "REUNIAO"]) {
      expect(decideSlotTrigger({ ...base(), type })).toBe("SKIP")
    }
  })

  it("SKIP when the entry does not block time", () => {
    expect(decideSlotTrigger({ ...base(), blocksTime: false })).toBe("SKIP")
  })

  it("SKIP for a slot in the past", () => {
    expect(
      decideSlotTrigger({ ...base(), scheduledAt: new Date("2026-06-14T12:00:00.000Z") })
    ).toBe("SKIP")
  })

  it("TRIAGE_ONLY when notice is below minNoticeHours", () => {
    const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2h ahead, min is 3
    expect(decideSlotTrigger({ ...base(), scheduledAt: soon })).toBe("TRIAGE_ONLY")
  })

  it("TRIAGE_ONLY when batchSize > 1", () => {
    expect(decideSlotTrigger({ ...base(), batchSize: 3 })).toBe("TRIAGE_ONLY")
  })

  it("TRIAGE_ONLY when notifications gate is off", () => {
    expect(decideSlotTrigger({ ...base(), notificationsEnabled: false })).toBe("TRIAGE_ONLY")
  })

  it("TRIAGE_ONLY when mode is manual triage", () => {
    expect(decideSlotTrigger({ ...base(), mode: "TRIAGEM" })).toBe("TRIAGE_ONLY")
  })
})

describe("triage Todo titles", () => {
  it("builds a single-slot title with DD/MM and HH:mm", () => {
    expect(buildTriageTodoTitle("17/06", "14:00", 3)).toBe(
      "Horário vago 17/06 14:00 — 3 na lista de espera"
    )
  })

  it("builds a batch title between two dates", () => {
    expect(buildBatchTodoTitle(5, "17/06", "24/06")).toBe(
      "5 horários vagos entre 17/06 e 24/06 — ver lista de espera"
    )
  })
})
