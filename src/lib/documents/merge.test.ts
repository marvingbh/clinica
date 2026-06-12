import { describe, it, expect } from "vitest"
import { extractPlaceholderKeys, mergeTemplate, splitContentBySessionTable } from "./merge"
import { SESSION_TABLE_TOKEN } from "./types"

describe("extractPlaceholderKeys", () => {
  it("extracts and dedupes keys", () => {
    const body = "Olá {{patientName}}, em {{appointmentDate}} com {{patientName}}."
    expect(extractPlaceholderKeys(body)).toEqual(["patientName", "appointmentDate"])
  })

  it("ignores malformed tags", () => {
    const body = "{{ }} {{123abc}} {{a-b}} {{ valid }} {{another}}"
    // "{{ valid }}" -> valid (whitespace allowed), "{{another}}" -> another
    expect(extractPlaceholderKeys(body)).toEqual(["valid", "another"])
  })

  it("returns empty when no placeholders", () => {
    expect(extractPlaceholderKeys("plain text")).toEqual([])
  })
})

describe("mergeTemplate", () => {
  it("substitutes multiple placeholders", () => {
    const body = "Olá {{patientName}}, data {{appointmentDate}}."
    const { content, unresolved } = mergeTemplate(
      body,
      { patientName: "Maria", appointmentDate: "11/06/2026" },
      []
    )
    expect(content).toBe("Olá Maria, data 11/06/2026.")
    expect(unresolved).toEqual([])
  })

  it("removes a line that becomes empty after stripping an optional placeholder", () => {
    const body = "Linha 1\n{{periodoAfastamento}}\nLinha 3"
    const { content } = mergeTemplate(body, {}, ["periodoAfastamento"])
    expect(content).toBe("Linha 1\nLinha 3")
  })

  it("keeps a line with surrounding text even if the optional placeholder is empty", () => {
    const body = "Período: {{periodoAfastamento}}"
    const { content } = mergeTemplate(body, {}, ["periodoAfastamento"])
    expect(content).toBe("Período: ")
  })

  it("reports a required unresolved placeholder and leaves the tag intact", () => {
    const body = "CRP {{crp}}"
    const { content, unresolved } = mergeTemplate(body, {}, [])
    expect(unresolved).toEqual(["crp"])
    expect(content).toBe("CRP {{crp}}")
  })
})

describe("splitContentBySessionTable", () => {
  it("splits around the token", () => {
    const content = `Antes\n${SESSION_TABLE_TOKEN}\nDepois`
    const res = splitContentBySessionTable(content)
    expect(res.hasTable).toBe(true)
    expect(res.before).toBe("Antes")
    expect(res.after).toBe("Depois")
  })

  it("returns hasTable false when no token", () => {
    const res = splitContentBySessionTable("texto simples")
    expect(res.hasTable).toBe(false)
    expect(res.before).toBe("texto simples")
    expect(res.after).toBe("")
  })
})
