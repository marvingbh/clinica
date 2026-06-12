"use client"

import type { DocumentTemplateDTO } from "./types"

interface SelectedTemplate {
  type: string
  templateId: string | null
}

interface Props {
  system: DocumentTemplateDTO[]
  custom: DocumentTemplateDTO[]
  selected: SelectedTemplate | null
  onSelect: (sel: SelectedTemplate, name: string) => void
}

const TYPE_LABELS: Record<string, string> = {
  DECLARACAO_COMPARECIMENTO: "Declaração de comparecimento",
  ATESTADO_PSICOLOGICO: "Atestado psicológico",
  RELATORIO_PSICOLOGICO: "Relatório psicológico",
  LAUDO_PSICOLOGICO: "Laudo psicológico",
  PARECER_PSICOLOGICO: "Parecer psicológico",
  ENCAMINHAMENTO: "Encaminhamento",
  CONTRATO_TERAPEUTICO: "Contrato terapêutico",
  RECIBO_REEMBOLSO: "Recibo para reembolso",
}

export function TemplatePickerStep({ system, custom, selected, onSelect }: Props) {
  function row(tpl: DocumentTemplateDTO, isSystem: boolean) {
    const id = tpl.id ?? null
    const isActive = selected?.type === tpl.type && selected?.templateId === id
    return (
      <button
        key={`${tpl.type}-${id ?? "sys"}`}
        type="button"
        onClick={() => onSelect({ type: tpl.type, templateId: id }, tpl.name)}
        className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
          isActive ? "border-blue-600 bg-blue-50" : "border-input hover:bg-muted"
        }`}
      >
        <div className="font-medium text-foreground">{tpl.name}</div>
        <div className="text-xs text-muted-foreground">
          {isSystem ? "Padrão do sistema" : "Modelo da clínica"} · {TYPE_LABELS[tpl.type] ?? tpl.type}
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Modelos do sistema</h4>
        <div className="space-y-2">{system.map((t) => row(t, true))}</div>
      </div>
      {custom.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Modelos da clínica</h4>
          <div className="space-y-2">{custom.map((t) => row(t, false))}</div>
        </div>
      )}
    </div>
  )
}
