import { describe, it, expect } from "vitest"
import { mockProvider } from "./mock"
import { buildNoteDraftPrompt } from "../prompt"
import type { DraftRequest } from "../types"

const req: DraftRequest = {
  format: "SOAP",
  sections: [
    { key: "subjetivo", label: "Subjetivo" },
    { key: "objetivo", label: "Objetivo" },
    { key: "avaliacao", label: "Avaliação" },
    { key: "plano", label: "Plano" },
  ],
  roughInput: "paciente relatou melhora no sono e maior adesão ao plano",
}

describe("mockProvider", () => {
  it("returns all requested sections", async () => {
    const r = await mockProvider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.ok).toBe(true)
    expect(Object.keys(r.sections ?? {})).toEqual(["subjetivo", "objetivo", "avaliacao", "plano"])
  })

  it("is deterministic for the same input", async () => {
    const prompt = buildNoteDraftPrompt(req)
    const a = await mockProvider.generateNoteDraft(prompt)
    const b = await mockProvider.generateNoteDraft(prompt)
    expect(a.sections).toEqual(b.sections)
  })

  it("reports positive token counts", async () => {
    const r = await mockProvider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.tokensIn).toBeGreaterThan(0)
    expect(r.tokensOut).toBeGreaterThan(0)
  })

  it("echoes the rough input into each section", async () => {
    const r = await mockProvider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.sections?.subjetivo).toContain("RASCUNHO MOCK")
    expect(r.sections?.subjetivo).toContain("paciente relatou melhora")
  })
})
