import type { InvoiceItemType } from "@prisma/client"

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
  /** Header line about the patient's reference professional, or empty string. */
  tecnico_referencia: string
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
  type?: InvoiceItemType | string
  /** Attending professional name; used when grouping by professional. */
  professionalName?: string | null
}

const TYPE_GROUP_LABELS: Record<string, string> = {
  SESSAO_REGULAR: "Sessões regulares",
  SESSAO_EXTRA: "Sessões extras",
  SESSAO_GRUPO: "Sessões grupo",
  REUNIAO_ESCOLA: "Reuniões escola",
  CREDITO: "Créditos",
}

const TYPE_GROUP_ORDER = ["SESSAO_REGULAR", "SESSAO_EXTRA", "SESSAO_GRUPO", "REUNIAO_ESCOLA", "CREDITO"]

export function buildDetailBlock(
  items: DetailItem[],
  options?: { grouped?: boolean; groupBy?: "type" | "professional" },
): string {
  if (items.length === 0) return ""

  const grouped = options?.grouped ?? false
  if (!grouped) return items.map(i => `- ${i.description}: ${i.total}`).join("\n")

  const groupBy = options?.groupBy ?? "type"

  if (groupBy === "professional") {
    // Sections by attending professional, with credits + items missing a
    // professional in their own trailing buckets.
    const order: string[] = []
    const byProf = new Map<string, DetailItem[]>()
    const others: DetailItem[] = []
    const credits: DetailItem[] = []

    for (const item of items) {
      if (item.type === "CREDITO") {
        credits.push(item)
        continue
      }
      const profName = item.professionalName ?? null
      if (!profName) {
        others.push(item)
        continue
      }
      if (!byProf.has(profName)) {
        byProf.set(profName, [])
        order.push(profName)
      }
      byProf.get(profName)!.push(item)
    }

    const sections: string[] = []
    for (const name of order) {
      const list = byProf.get(name)!
      const lines = list.map(i => `  - ${i.description}: ${i.total}`)
      sections.push(`Atendido por ${name}:\n${lines.join("\n")}`)
    }
    if (others.length > 0) {
      const lines = others.map(i => `  - ${i.description}: ${i.total}`)
      sections.push(`Outros:\n${lines.join("\n")}`)
    }
    if (credits.length > 0) {
      const lines = credits.map(i => `  - ${i.description}: ${i.total}`)
      sections.push(`Créditos:\n${lines.join("\n")}`)
    }
    return sections.join("\n\n")
  }

  // Default: groupBy === "type"
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
