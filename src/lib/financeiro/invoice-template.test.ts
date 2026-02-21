import { describe, it, expect } from "vitest"
import { renderInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE, type TemplateVariables } from "./invoice-template"

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
