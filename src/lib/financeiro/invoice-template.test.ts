import { describe, it, expect } from "vitest"
import {
  renderInvoiceTemplate,
  buildDetailBlock,
  DEFAULT_INVOICE_TEMPLATE,
  type TemplateVariables,
  type DetailItem,
} from "./invoice-template"

const baseVars: TemplateVariables = {
  paciente: "João Silva",
  mae: "Maria Silva",
  pai: "Carlos Silva",
  valor: "R$ 600,00",
  mes: "Março",
  ano: "2026",
  vencimento: "15/03/2026",
  sessoes: "4",
  profissional: "Dra. Ana Costa",
  sessoes_regulares: "3",
  sessoes_extras: "1",
  sessoes_grupo: "0",
  reunioes_escola: "0",
  creditos: "0",
  valor_sessao: "R$ 150,00",
  detalhes: "",
}

describe("renderInvoiceTemplate", () => {
  it("replaces all variables in template", () => {
    const template = "Paciente: {{paciente}}, Mãe: {{mae}}, Valor: {{valor}}"
    const result = renderInvoiceTemplate(template, baseVars)
    expect(result).toBe("Paciente: João Silva, Mãe: Maria Silva, Valor: R$ 600,00")
  })

  it("handles missing variables by leaving placeholder", () => {
    const template = "{{paciente}} - {{unknown}}"
    const result = renderInvoiceTemplate(template, baseVars)
    expect(result).toBe("João Silva - {{unknown}}")
  })

  it("handles empty string values", () => {
    const vars = { ...baseVars, pai: "" }
    const template = "Pai: {{pai}}"
    const result = renderInvoiceTemplate(template, vars)
    expect(result).toBe("Pai: ")
  })

  it("renders the default template with all variables", () => {
    const result = renderInvoiceTemplate(DEFAULT_INVOICE_TEMPLATE, baseVars)
    expect(result).toContain("João Silva")
    expect(result).toContain("Maria Silva")
    expect(result).toContain("R$ 600,00")
    expect(result).toContain("15/03/2026")
    expect(result).toContain("Março")
    expect(result).toContain("2026")
    expect(result).toContain("4")
    expect(result).toContain("Dra. Ana Costa")
  })

  it("resolves template with patient override over clinic default", () => {
    const patientTemplate = "Olá {{mae}}, valor: {{valor}}"
    const clinicTemplate = "Prezado(a), segue fatura de {{paciente}}"
    const result = renderInvoiceTemplate(patientTemplate || clinicTemplate, baseVars)
    expect(result).toBe("Olá Maria Silva, valor: R$ 600,00")
  })

  it("falls back to clinic template when patient template is null", () => {
    const patientTemplate: string | null = null
    const clinicTemplate = "Clínica default: {{paciente}}"
    const result = renderInvoiceTemplate(patientTemplate || clinicTemplate || DEFAULT_INVOICE_TEMPLATE, baseVars)
    expect(result).toBe("Clínica default: João Silva")
  })

  it("replaces new section variables", () => {
    const template = "Regular: {{sessoes_regulares}}, Extras: {{sessoes_extras}}, Grupo: {{sessoes_grupo}}, Escola: {{reunioes_escola}}, Créditos: {{creditos}}, Valor sessão: {{valor_sessao}}"
    const vars = {
      ...baseVars,
      sessoes_regulares: "3",
      sessoes_extras: "1",
      sessoes_grupo: "2",
      reunioes_escola: "1",
      creditos: "2",
      valor_sessao: "R$ 150,00",
    }
    const result = renderInvoiceTemplate(template, vars)
    expect(result).toBe("Regular: 3, Extras: 1, Grupo: 2, Escola: 1, Créditos: 2, Valor sessão: R$ 150,00")
  })

  it("replaces detalhes variable with formatted detail block", () => {
    const template = "Fatura:\n{{detalhes}}\nTotal: {{valor}}"
    const vars = { ...baseVars, detalhes: "- Sessão 01/03 R$ 150,00\n- Sessão 08/03 R$ 150,00" }
    const result = renderInvoiceTemplate(template, vars)
    expect(result).toContain("- Sessão 01/03 R$ 150,00")
    expect(result).toContain("- Sessão 08/03 R$ 150,00")
    expect(result).toContain("Total: R$ 600,00")
  })
})

describe("DEFAULT_INVOICE_TEMPLATE", () => {
  it("contains all expected variable placeholders", () => {
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{paciente}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{mae}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{valor}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{vencimento}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{sessoes}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{profissional}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{mes}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{ano}}")
  })
})

describe("buildDetailBlock", () => {
  it("returns empty string for empty items", () => {
    expect(buildDetailBlock([])).toBe("")
  })

  it("formats a single item", () => {
    const items: DetailItem[] = [
      { description: "Sessão - 01/03", total: "R$ 150,00" },
    ]
    expect(buildDetailBlock(items)).toBe("- Sessão - 01/03: R$ 150,00")
  })

  it("formats multiple items separated by newlines", () => {
    const items: DetailItem[] = [
      { description: "Sessão - 01/03", total: "R$ 150,00" },
      { description: "Sessão - 08/03", total: "R$ 150,00" },
      { description: "Crédito: Desmarcou - 15/02", total: "-R$ 150,00" },
    ]
    const result = buildDetailBlock(items)
    const lines = result.split("\n")
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe("- Sessão - 01/03: R$ 150,00")
    expect(lines[1]).toBe("- Sessão - 08/03: R$ 150,00")
    expect(lines[2]).toBe("- Crédito: Desmarcou - 15/02: -R$ 150,00")
  })

  it("groups items by type with headers when grouped", () => {
    const items: DetailItem[] = [
      { description: "Sessão - 01/03", total: "R$ 150,00", type: "SESSAO_REGULAR" },
      { description: "Sessão - 08/03", total: "R$ 150,00", type: "SESSAO_REGULAR" },
      { description: "Sessão extra - 15/03", total: "R$ 150,00", type: "SESSAO_EXTRA" },
      { description: "Crédito: Desmarcou", total: "-R$ 150,00", type: "CREDITO" },
    ]
    const result = buildDetailBlock(items, { grouped: true })
    expect(result).toContain("Sessões regulares:")
    expect(result).toContain("Sessões extras:")
    expect(result).toContain("Créditos:")
    expect(result).toContain("- Sessão - 01/03: R$ 150,00")
    expect(result).toContain("- Sessão extra - 15/03: R$ 150,00")
  })

  it("omits empty groups when grouped", () => {
    const items: DetailItem[] = [
      { description: "Sessão - 01/03", total: "R$ 150,00", type: "SESSAO_REGULAR" },
    ]
    const result = buildDetailBlock(items, { grouped: true })
    expect(result).toContain("Sessões regulares:")
    expect(result).not.toContain("Sessões extras:")
    expect(result).not.toContain("Sessões grupo:")
    expect(result).not.toContain("Créditos:")
  })

  describe("groupBy: 'professional'", () => {
    it("groups items by attending professional name in input order", () => {
      const items: DetailItem[] = [
        { description: "Psicoterapia individual - 02/03", total: "R$ 240,00", type: "SESSAO_REGULAR", professionalName: "Elena" },
        { description: "Psicoterapia em grupo — Keep Lua - 10/03", total: "R$ 240,00", type: "SESSAO_GRUPO", professionalName: "Cherlen" },
        { description: "Psicoterapia individual - 09/03", total: "R$ 240,00", type: "SESSAO_REGULAR", professionalName: "Elena" },
      ]
      const result = buildDetailBlock(items, { grouped: true, groupBy: "professional" })
      const sections = result.split("\n\n")

      expect(sections[0]).toContain("Atendido por Elena:")
      expect(sections[0]).toContain("Psicoterapia individual - 02/03")
      expect(sections[0]).toContain("Psicoterapia individual - 09/03")
      expect(sections[1]).toContain("Atendido por Cherlen:")
      expect(sections[1]).toContain("Psicoterapia em grupo — Keep Lua - 10/03")
    })

    it("buckets items without a professionalName under Outros (after pro sections)", () => {
      const items: DetailItem[] = [
        { description: "Psicoterapia individual - 02/03", total: "R$ 240,00", type: "SESSAO_REGULAR", professionalName: "Elena" },
        { description: "Psicoterapia em grupo - 10/03", total: "R$ 240,00", type: "SESSAO_GRUPO", professionalName: "Cherlen" },
        { description: "Psicoterapia Individual (extra) - 12/03", total: "R$ 240,00", type: "SESSAO_EXTRA" },
      ]
      const result = buildDetailBlock(items, { grouped: true, groupBy: "professional" })

      expect(result.indexOf("Atendido por Elena:")).toBeLessThan(result.indexOf("Outros:"))
      expect(result.indexOf("Atendido por Cherlen:")).toBeLessThan(result.indexOf("Outros:"))
      expect(result).toMatch(/Outros:\n\s+- Psicoterapia Individual \(extra\) - 12\/03/)
    })

    it("places CREDITO items in a trailing Créditos section regardless of professional", () => {
      const items: DetailItem[] = [
        { description: "Psicoterapia individual - 02/03", total: "R$ 240,00", type: "SESSAO_REGULAR", professionalName: "Elena" },
        { description: "Crédito: Desmarcou - 17/03", total: "-R$ 240,00", type: "CREDITO" },
      ]
      const result = buildDetailBlock(items, { grouped: true, groupBy: "professional" })

      expect(result).toContain("Atendido por Elena:")
      expect(result).toContain("Créditos:")
      expect(result.indexOf("Atendido por Elena:")).toBeLessThan(result.indexOf("Créditos:"))
    })

    it("emits no professional sections when only credits are present", () => {
      const items: DetailItem[] = [
        { description: "Crédito: Desmarcou", total: "-R$ 240,00", type: "CREDITO" },
      ]
      const result = buildDetailBlock(items, { grouped: true, groupBy: "professional" })

      expect(result).toBe("Créditos:\n  - Crédito: Desmarcou: -R$ 240,00")
      expect(result).not.toContain("Atendido por")
      expect(result).not.toContain("Outros:")
    })
  })
})
