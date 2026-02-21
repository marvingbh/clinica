export interface TemplateVariables {
  paciente: string
  mae: string
  pai: string
  valor: string
  mes: string
  ano: string
  vencimento: string
  sessoes: string
  profissional: string
}

export const DEFAULT_INVOICE_TEMPLATE = `Prezado(a) {{mae}},

Segue a fatura de {{paciente}} referente ao mês de {{mes}}/{{ano}}.

Valor: {{valor}}
Vencimento: {{vencimento}}
Total de sessões: {{sessoes}}

Atenciosamente,
{{profissional}}`

export function renderInvoiceTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key as keyof TemplateVariables]
    return value !== undefined ? value : match
  })
}
