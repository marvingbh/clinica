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
})
