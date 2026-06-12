"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"
import { BottomSheet } from "@/shared/components/ui/bottom-sheet"

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

// Placeholder chips offered for insertion (mirror of the server registry).
const PLACEHOLDER_CHIPS = [
  "patientName", "patientCpf", "guardianName", "patientBirthDate",
  "appointmentDate", "appointmentStartTime", "appointmentEndTime",
  "professionalName", "crp", "professionalCpfCnpj", "clinicName", "clinicAddress",
  "sessionList", "totalValue", "currentDate",
  "finalidade", "periodoAfastamento", "identificacao", "demanda", "procedimento",
  "analise", "conclusao", "exposicaoMotivos", "destinatario", "motivoEncaminhamento", "tussCode",
]

interface Props {
  isOpen: boolean
  onClose: () => void
  /** When set, edit this template; otherwise create from this seed. */
  initial: { id?: string; type: string; name: string; body: string }
  onSaved: () => void
}

export function TemplateEditorSheet({ isOpen, onClose, initial, onSaved }: Props) {
  const [name, setName] = useState(initial.name)
  const [body, setBody] = useState(initial.body)
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const isEdit = !!initial.id

  function insertChip(key: string) {
    const el = bodyRef.current
    const token = `{{${key}}}`
    if (!el) {
      setBody((b) => b + token)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    setBody(body.slice(0, start) + token + body.slice(end))
  }

  async function save() {
    setSaving(true)
    try {
      const url = isEdit ? `/api/documents/templates/${initial.id}` : "/api/documents/templates"
      const method = isEdit ? "PATCH" : "POST"
      const payload = isEdit ? { name, body } : { type: initial.type, name, body }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422 && data.unknownKeys) {
        toast.error(`Placeholders desconhecidos: ${data.unknownKeys.join(", ")}`)
        return
      }
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao salvar modelo")
        return
      }
      toast.success("Modelo salvo")
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={isEdit ? "Editar modelo" : "Novo modelo"}>
      <div className="space-y-4 pb-2">
        <p className="text-xs text-muted-foreground">{TYPE_LABELS[initial.type] ?? initial.type}</p>

        {initial.type === "DECLARACAO_COMPARECIMENTO" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            Por norma do CFP, declarações de comparecimento não podem conter diagnóstico ou qualquer conteúdo clínico.
          </div>
        )}

        <label className="block text-sm">
          <span className="block text-muted-foreground mb-1">Nome do modelo</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </label>

        <div>
          <span className="block text-sm text-muted-foreground mb-1">Corpo</span>
          <div className="flex flex-wrap gap-1 mb-2">
            {PLACEHOLDER_CHIPS.map((k) => (
              <button key={k} type="button" onClick={() => insertChip(k)} className="rounded-full border border-input bg-muted/60 px-2 py-0.5 text-[11px] hover:bg-muted">
                {`{{${k}}}`}
              </button>
            ))}
          </div>
          <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" />
        </div>

        <div className="flex justify-end border-t pt-4">
          <button type="button" onClick={save} disabled={saving || !name.trim() || !body.trim()} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
