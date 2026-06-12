import { describe, it, expect } from "vitest"
import {
  buildEntityMap,
  pseudonymizeText,
  reidentifyText,
  pseudonymizeSections,
} from "./pseudonymize"

describe("buildEntityMap", () => {
  it("ignores null/undefined optional fields", () => {
    const ents = buildEntityMap({ name: "Maria Silva", cpf: null, phone: undefined })
    expect(ents.some((e) => e.token === "[CPF_1]")).toBe(false)
    expect(ents.some((e) => e.token === "[TEL_1]")).toBe(false)
    expect(ents.some((e) => e.token === "[PACIENTE]")).toBe(true)
  })

  it("gives distinct tokens to two CPFs (cpf + billingCpf)", () => {
    const ents = buildEntityMap({ name: "Joao", cpf: "111.111.111-11", billingCpf: "222.222.222-22" })
    const cpfTokens = ents.filter((e) => e.token.startsWith("[CPF_"))
    expect(cpfTokens.map((e) => e.token)).toEqual(["[CPF_1]", "[CPF_2]"])
    expect(cpfTokens[0].value).not.toBe(cpfTokens[1].value)
  })

  it("does not add an isolated first name token when first name is short (< 4 chars)", () => {
    const ents = buildEntityMap({ name: "Ana Beatriz" })
    const patientEntities = ents.filter((e) => e.token === "[PACIENTE]")
    // Only the full name, not the short first name "Ana".
    expect(patientEntities).toHaveLength(1)
    expect(patientEntities[0].value).toBe("Ana Beatriz")
  })

  it("adds an isolated first name token when first name is long enough", () => {
    const ents = buildEntityMap({ name: "Mariana Costa" })
    const values = ents.filter((e) => e.token === "[PACIENTE]").map((e) => e.value)
    expect(values).toContain("Mariana Costa")
    expect(values).toContain("Mariana")
  })
})

describe("pseudonymizeText", () => {
  function entitiesFor(p: Parameters<typeof buildEntityMap>[0]) {
    return buildEntityMap(p)
  }

  it("replaces full name and isolated first name, case/accent-insensitive", () => {
    const ents = entitiesFor({ name: "Mariana Conceição" })
    const { text } = pseudonymizeText(
      "MARIANA CONCEICAO chegou. mariana relatou melhora.",
      ents
    )
    expect(text).not.toMatch(/mariana/i)
    expect(text).toContain("[PACIENTE]")
  })

  it("does NOT replace a short first name appearing alone", () => {
    const ents = entitiesFor({ name: "Ana Beatriz Lima" })
    const { text } = pseudonymizeText("Conversamos sobre a Ana de outra clínica.", ents)
    // "Ana" alone is below the threshold and must remain.
    expect(text).toContain("Ana")
  })

  it("replaces CPF with and without mask", () => {
    const ents = entitiesFor({ name: "Joao", cpf: "123.456.789-09" })
    const masked = pseudonymizeText("CPF: 123.456.789-09", ents).text
    expect(masked).toContain("[CPF_1]")
    const ents2 = entitiesFor({ name: "Joao", cpf: "12345678909" })
    const unmasked = pseudonymizeText("doc 12345678909 ok", ents2).text
    expect(unmasked).toContain("[CPF_1]")
  })

  it("replaces phone with/without +55/DDD/mask", () => {
    const ents = entitiesFor({ name: "Joao", phone: "5541999998888" })
    const r = pseudonymizeText("ligar para 5541999998888", ents).text
    expect(r).toContain("[TEL_1]")
  })

  it("replaces e-mail", () => {
    const ents = entitiesFor({ name: "Joao", email: "joao@example.com" })
    const r = pseudonymizeText("email joao@example.com", ents).text
    expect(r).toContain("[EMAIL_1]")
  })

  it("replaces mother and father names", () => {
    const ents = entitiesFor({ name: "Pedro", motherName: "Helena Souza", fatherName: "Carlos Souza" })
    const r = pseudonymizeText("A mãe Helena Souza e o pai Carlos Souza vieram.", ents).text
    expect(r).toContain("[MAE]")
    expect(r).toContain("[PAI]")
  })

  it("scrubs third-party CPF/phone/e-mail not registered on the patient", () => {
    const ents = entitiesFor({ name: "Joao" })
    const r = pseudonymizeText(
      "Citou o irmão CPF 999.888.777-66, tel 11988887777, mail outro@x.com",
      ents
    ).text
    expect(r).toContain("[CPF_X1]")
    expect(r).toContain("[TEL_X1]")
    expect(r).toContain("[EMAIL_X1]")
  })

  it("leaves text without PII identical", () => {
    const ents = entitiesFor({ name: "Joaquim" })
    const original = "Sessão produtiva, paciente engajado em exposição gradual."
    expect(pseudonymizeText(original, ents).text).toBe(original)
  })
})

describe("reidentifyText", () => {
  it("does an exact roundtrip", () => {
    const ents = buildEntityMap({ name: "Mariana Costa", cpf: "123.456.789-09" })
    const { text, tokenMap } = pseudonymizeText("Mariana Costa, CPF 123.456.789-09, evoluiu bem.", ents)
    const back = reidentifyText(text, tokenMap)
    expect(back).toContain("Mariana Costa")
    expect(back).toContain("123.456.789-09")
  })

  it("re-identifies sections in batch", () => {
    const ents = buildEntityMap({ name: "Mariana Costa" })
    const { tokenMap } = pseudonymizeText("Mariana Costa", ents)
    const out = pseudonymizeSections(
      { subjetivo: "[PACIENTE] relatou melhora", plano: "manter plano" },
      tokenMap
    )
    expect(out.subjetivo).toContain("Mariana Costa")
    expect(out.plano).toBe("manter plano")
  })
})
