import { describe, it, expect } from "vitest"
import { blocksTimeForType } from "./entry-types"

describe("blocksTimeForType", () => {
  it("blocks time for CONSULTA, TAREFA and REUNIAO", () => {
    expect(blocksTimeForType("CONSULTA")).toBe(true)
    expect(blocksTimeForType("TAREFA")).toBe(true)
    expect(blocksTimeForType("REUNIAO")).toBe(true)
  })

  it("does not block time for LEMBRETE and NOTA", () => {
    expect(blocksTimeForType("LEMBRETE")).toBe(false)
    expect(blocksTimeForType("NOTA")).toBe(false)
  })
})
