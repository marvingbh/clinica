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
  sessoes_regulares: string
  sessoes_extras: string
  sessoes_grupo: string
  reunioes_escola: string
  creditos: string
  valor_sessao: string
  detalhes: string
}

export interface DetailItem {
  description: string
  total: string
  type?: string
}

const TYPE_GROUP_LABELS: Record<string, string> = {
  SESSAO_REGULAR: "Sessões regulares",
  SESSAO_EXTRA: "Sessões extras",
  SESSAO_GRUPO: "Sessões grupo",
  REUNIAO_ESCOLA: "Reuniões escola",
  CREDITO: "Créditos",
}

const TYPE_GROUP_ORDER = ["SESSAO_REGULAR", "SESSAO_EXTRA", "SESSAO_GRUPO", "REUNIAO_ESCOLA", "CREDITO"]

export function buildDetailBlock(items: DetailItem[], options?: { grouped?: boolean }): string {
  if (items.length === 0) return ""

  if (options?.grouped) {
    const groups = new Map<string, DetailItem[]>()
    for (const item of items) {
      const key = item.type || "SESSAO_REGULAR"
      const list = groups.get(key) || []
      list.push(item)
      groups.set(key, list)
    }

    const sections: string[] = []
    for (const type of TYPE_GROUP_ORDER) {
      const groupItems = groups.get(type)
      if (!groupItems || groupItems.length === 0) continue
      const header = TYPE_GROUP_LABELS[type] || type
      const lines = groupItems.map(i => `  - ${i.description}: ${i.total}`)
      sections.push(`${header}:\n${lines.join("\n")}`)
    }
    return sections.join("\n\n")
  }

  return items.map(i => `- ${i.description}: ${i.total}`).join("\n")
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
