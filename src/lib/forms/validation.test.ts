import { describe, it, expect } from "vitest"
import { validateAnswer, validateSubmission, sanitizeAnswers, isValidBrDate } from "./validation"
import type { FormField } from "./types"

describe("validateAnswer", () => {
  it("required empty → Campo obrigatório", () => {
    const f: FormField = { id: "a", type: "short_text", label: "Nome", required: true }
    expect(validateAnswer(f, "")).toBe("Campo obrigatório")
    expect(validateAnswer(f, undefined)).toBe("Campo obrigatório")
  })

  it("optional empty → null", () => {
    const f: FormField = { id: "a", type: "short_text", label: "Nome" }
    expect(validateAnswer(f, "")).toBeNull()
  })

  it("invalid date 31/02/2026 → pt-BR message", () => {
    const f: FormField = { id: "a", type: "date", label: "Data", required: true }
    expect(validateAnswer(f, "31/02/2026")).toBe("Data inválida (use DD/MM/AAAA)")
    expect(validateAnswer(f, "2026-02-15")).toBe("Data inválida (use DD/MM/AAAA)")
  })

  it("valid DD/MM/YYYY date passes", () => {
    const f: FormField = { id: "a", type: "date", label: "Data" }
    expect(validateAnswer(f, "15/02/2026")).toBeNull()
  })

  it("scale outside 0–10 fails", () => {
    const f: FormField = { id: "a", type: "scale_0_10", label: "Humor", required: true }
    expect(validateAnswer(f, 11)).toBe("Escolha um valor entre 0 e 10")
    expect(validateAnswer(f, -1)).toBe("Escolha um valor entre 0 e 10")
    expect(validateAnswer(f, 7)).toBeNull()
  })

  it("multiple_choice with unknown option fails", () => {
    const f: FormField = { id: "a", type: "multiple_choice", label: "Sintomas", options: ["X", "Y"] }
    expect(validateAnswer(f, ["X", "Z"])).toBe("Selecione uma opção")
    expect(validateAnswer(f, ["X", "Y"])).toBeNull()
  })

  it("required info_consent requires true", () => {
    const f: FormField = { id: "a", type: "info_consent", label: "Termo", infoText: "...", required: true }
    expect(validateAnswer(f, false)).toBe("É necessário aceitar para continuar")
    expect(validateAnswer(f, undefined)).toBe("É necessário aceitar para continuar")
    expect(validateAnswer(f, true)).toBeNull()
  })

  it("section never errors", () => {
    const f: FormField = { id: "a", type: "section", label: "Seção" }
    expect(validateAnswer(f, undefined)).toBeNull()
  })
})

describe("isValidBrDate", () => {
  it("rejects impossible calendar days", () => {
    expect(isValidBrDate("31/02/2026")).toBe(false)
    expect(isValidBrDate("00/01/2026")).toBe(false)
    expect(isValidBrDate("15/13/2026")).toBe(false)
  })
  it("accepts real dates", () => {
    expect(isValidBrDate("29/02/2024")).toBe(true) // leap year
    expect(isValidBrDate("01/01/2026")).toBe(true)
  })
})

describe("validateSubmission", () => {
  const fields: FormField[] = [
    { id: "a", type: "yes_no", label: "Toma medicação?", required: true },
    { id: "b", type: "short_text", label: "Quais?", required: true, visibleWhen: { fieldId: "a", equals: true } },
  ]

  it("ignores conditionally-invisible fields", () => {
    const res = validateSubmission(fields, { a: false })
    expect(res.valid).toBe(true)
    expect(res.errors).toEqual({})
  })

  it("validates the conditional field once visible", () => {
    const res = validateSubmission(fields, { a: true })
    expect(res.valid).toBe(false)
    expect(res.errors.b).toBe("Campo obrigatório")
  })
})

describe("sanitizeAnswers", () => {
  const fields: FormField[] = [
    { id: "a", type: "yes_no", label: "Toma medicação?" },
    { id: "b", type: "short_text", label: "Quais?", visibleWhen: { fieldId: "a", equals: true } },
    { id: "sec", type: "section", label: "Seção" },
  ]

  it("drops unknown ids and section answers", () => {
    const out = sanitizeAnswers(fields, { a: true, ghost: "x", sec: "y" } as never)
    expect(out).toEqual({ a: true })
  })

  it("drops answers of invisible fields", () => {
    // a=false hides b; b's answer must be discarded.
    const out = sanitizeAnswers(fields, { a: false, b: "Rivotril" })
    expect(out).toEqual({ a: false })
  })

  it("keeps answers of visible conditional fields", () => {
    const out = sanitizeAnswers(fields, { a: true, b: "Rivotril" })
    expect(out).toEqual({ a: true, b: "Rivotril" })
  })

  it("discards type-mismatched values", () => {
    const out = sanitizeAnswers(fields, { a: "yes" } as never)
    expect(out).toEqual({})
  })
})
