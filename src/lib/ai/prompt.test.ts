import { describe, it, expect } from "vitest"
import { buildNoteDraftPrompt } from "./prompt"
import type { DraftRequest } from "./types"

const soapSections = [
  { key: "subjetivo", label: "Subjetivo" },
  { key: "objetivo", label: "Objetivo" },
  { key: "avaliacao", label: "Avaliação" },
  { key: "plano", label: "Plano" },
]

function base(overrides: Partial<DraftRequest> = {}): DraftRequest {
  return {
    format: "SOAP",
    sections: soapSections,
    roughInput: "paciente relatou melhora no sono",
    ...overrides,
  }
}

describe("buildNoteDraftPrompt", () => {
  it("includes the correct format definition (SOAP)", () => {
    const { system } = buildNoteDraftPrompt(base({ format: "SOAP" }))
    expect(system).toMatch(/Formato SOAP/)
    expect(system).not.toMatch(/Formato DAP/)
  })

  it("includes the correct format definition (DAP)", () => {
    const { system } = buildNoteDraftPrompt(
      base({ format: "DAP", sections: [{ key: "dados", label: "Dados" }] })
    )
    expect(system).toMatch(/Formato DAP/)
  })

  it("includes the correct format definition (LIVRE)", () => {
    const { system } = buildNoteDraftPrompt(
      base({ format: "LIVRE", sections: [{ key: "registro", label: "Registro" }] })
    )
    expect(system).toMatch(/Formato livre/)
  })

  it("includes the approach when present and omits it when absent", () => {
    const withAbordagem = buildNoteDraftPrompt(base({ abordagem: "TCC" }))
    expect(withAbordagem.system).toMatch(/TCC/)
    const without = buildNoteDraftPrompt(base())
    expect(without.system).not.toMatch(/abordagem terapêutica/)
  })

  it("includes historyContext only when provided", () => {
    const without = buildNoteDraftPrompt(base())
    expect(without.user).not.toMatch(/notas anteriores/)
    const withHistory = buildNoteDraftPrompt(base({ historyContext: ["resumo um", "resumo dois"] }))
    expect(withHistory.user).toMatch(/notas anteriores/)
    expect(withHistory.user).toMatch(/resumo um/)
  })

  it("includes sharedContext only when provided", () => {
    const without = buildNoteDraftPrompt(base())
    expect(without.user).not.toMatch(/Resumo compartilhado/)
    const withShared = buildNoteDraftPrompt(base({ sharedContext: "dinâmica de grupo" }))
    expect(withShared.user).toMatch(/Resumo compartilhado/)
    expect(withShared.user).toMatch(/dinâmica de grupo/)
  })

  it("always includes the pt-BR instruction", () => {
    const { system } = buildNoteDraftPrompt(base())
    expect(system).toMatch(/português do Brasil/)
  })

  it("always includes the token-preservation instruction", () => {
    const { system } = buildNoteDraftPrompt(base())
    expect(system).toMatch(/marcadores entre colchetes/)
  })

  it("builds a schema with exactly the requested sections and additionalProperties false", () => {
    const { schema } = buildNoteDraftPrompt(base())
    expect(schema.additionalProperties).toBe(false)
    expect(Object.keys(schema.properties as object)).toEqual([
      "subjetivo",
      "objetivo",
      "avaliacao",
      "plano",
    ])
    expect(schema.required).toEqual(["subjetivo", "objetivo", "avaliacao", "plano"])
  })
})
