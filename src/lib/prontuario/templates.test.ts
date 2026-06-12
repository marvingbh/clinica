import { describe, it, expect } from "vitest"
import { DEFAULT_TEMPLATES, validateSectionDefs } from "./templates"

describe("DEFAULT_TEMPLATES", () => {
  it("has SOAP with 4 sections, DAP with 3, Livre with 1", () => {
    const soap = DEFAULT_TEMPLATES.find((t) => t.name === "SOAP")!
    const dap = DEFAULT_TEMPLATES.find((t) => t.name === "DAP")!
    const livre = DEFAULT_TEMPLATES.find((t) => t.name === "Livre")!
    expect(soap.sectionDefs).toHaveLength(4)
    expect(dap.sectionDefs).toHaveLength(3)
    expect(livre.sectionDefs).toHaveLength(1)
  })

  it("uses stable section ids", () => {
    const soap = DEFAULT_TEMPLATES.find((t) => t.name === "SOAP")!
    expect(soap.sectionDefs.map((s) => s.id)).toEqual([
      "subjetivo",
      "objetivo",
      "avaliacao",
      "plano",
    ])
    const livre = DEFAULT_TEMPLATES.find((t) => t.name === "Livre")!
    expect(livre.sectionDefs[0].id).toBe("registro")
  })

  it("maps each template name to the right format", () => {
    expect(DEFAULT_TEMPLATES.find((t) => t.name === "SOAP")!.format).toBe("SOAP")
    expect(DEFAULT_TEMPLATES.find((t) => t.name === "DAP")!.format).toBe("DAP")
    expect(DEFAULT_TEMPLATES.find((t) => t.name === "Livre")!.format).toBe("LIVRE")
  })
})

describe("validateSectionDefs", () => {
  it("accepts a valid array with optional helpText", () => {
    const result = validateSectionDefs([
      { id: "a", label: "A", helpText: "ajuda" },
      { id: "b", label: "B" },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].helpText).toBe("ajuda")
    expect(result[1].helpText).toBeUndefined()
  })

  it("rejects a non-array", () => {
    expect(() => validateSectionDefs({})).toThrow()
    expect(() => validateSectionDefs("x")).toThrow()
  })

  it("rejects an empty array", () => {
    expect(() => validateSectionDefs([])).toThrow()
  })

  it("rejects duplicate ids", () => {
    expect(() =>
      validateSectionDefs([
        { id: "a", label: "A" },
        { id: "a", label: "B" },
      ])
    ).toThrow(/duplicado/i)
  })

  it("rejects empty label", () => {
    expect(() => validateSectionDefs([{ id: "a", label: "" }])).toThrow()
    expect(() => validateSectionDefs([{ id: "a", label: "   " }])).toThrow()
  })

  it("rejects non-string helpText", () => {
    expect(() => validateSectionDefs([{ id: "a", label: "A", helpText: 5 }])).toThrow()
  })
})
