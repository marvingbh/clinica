"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { BottomSheet } from "@/shared/components/ui/bottom-sheet"
import { TemplatePickerStep } from "./TemplatePickerStep"
import { DocumentDataStep } from "./DocumentDataStep"
import { DocumentPreviewStep } from "./DocumentPreviewStep"
import type { DocumentTemplateDTO, MissingFieldDTO, SessionRowDTO, WizardSeed } from "./types"

interface Props {
  isOpen: boolean
  onClose: () => void
  seed: WizardSeed
  onGenerated: () => void
}

type Step = "template" | "data" | "preview"

interface Selected {
  type: string
  templateId: string | null
  name: string
  body: string
}

export function DocumentWizardSheet({ isOpen, onClose, seed, onGenerated }: Props) {
  const [step, setStep] = useState<Step>("template")
  const [system, setSystem] = useState<DocumentTemplateDTO[]>([])
  const [custom, setCustom] = useState<DocumentTemplateDTO[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)
  const [manualFields, setManualFields] = useState<Record<string, string>>({})
  const [itemIds, setItemIds] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [content, setContent] = useState("")
  const [sessionRows, setSessionRows] = useState<SessionRowDTO[]>([])
  const [missing, setMissing] = useState<MissingFieldDTO[]>([])
  const [generating, setGenerating] = useState(false)

  useMountEffect(() => {
    fetch("/api/documents/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const sys: DocumentTemplateDTO[] = data.system ?? []
        setSystem(sys)
        setCustom(data.custom ?? [])
        if (seed.defaultType) {
          const match = sys.find((t) => t.type === seed.defaultType)
          if (match) setSelected({ type: match.type, templateId: null, name: match.name, body: match.body })
        }
      })
      .catch(() => toast.error("Erro ao carregar modelos"))
  })

  function pickTemplate(sel: { type: string; templateId: string | null }) {
    const pool = sel.templateId ? custom : system
    const tpl = pool.find((t) => t.type === sel.type && (t.id ?? null) === sel.templateId)
    if (tpl) setSelected({ type: sel.type, templateId: sel.templateId, name: tpl.name, body: tpl.body })
  }

  function buildBody() {
    return {
      templateType: selected!.type,
      templateId: selected!.templateId,
      patientId: seed.patientId,
      appointmentId: seed.appointmentId ?? null,
      invoiceItemIds: itemIds.length > 0 ? itemIds : undefined,
      manualFields,
    }
  }

  async function goPreview() {
    if (!selected) return
    setStep("preview")
    setPreviewLoading(true)
    try {
      const res = await fetch("/api/documents/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao gerar pré-visualização")
        setContent("")
        setSessionRows([])
        setMissing([])
        return
      }
      setContent(data.content ?? "")
      setSessionRows(data.sessionRows ?? [])
      setMissing(data.missingFields ?? [])
    } finally {
      setPreviewLoading(false)
    }
  }

  async function generate() {
    if (!selected) return
    setGenerating(true)
    try {
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422) {
        setMissing(data.missingFields ?? [])
        toast.error("Faltam dados para gerar este documento")
        return
      }
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao gerar documento")
        return
      }
      toast.success("Documento gerado com sucesso")
      window.open(`/api/documents/${data.id}/pdf`, "_blank")
      onGenerated()
      onClose()
    } finally {
      setGenerating(false)
    }
  }

  const blocked = missing.length > 0

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Novo documento">
      <div className="space-y-5 pb-2">
        <Stepper step={step} />

        {step === "template" && (
          <TemplatePickerStep
            system={system}
            custom={custom}
            selected={selected ? { type: selected.type, templateId: selected.templateId } : null}
            onSelect={pickTemplate}
          />
        )}

        {step === "data" && selected && (
          <DocumentDataStep
            patientId={seed.patientId}
            templateBody={selected.body}
            manualFields={manualFields}
            onManualChange={(k, v) => setManualFields((prev) => ({ ...prev, [k]: v }))}
            selectedItemIds={itemIds}
            onItemsChange={setItemIds}
          />
        )}

        {step === "preview" && (
          <DocumentPreviewStep loading={previewLoading} content={content} sessionRows={sessionRows} missing={missing} />
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <button
            type="button"
            onClick={() => setStep(step === "preview" ? "data" : "template")}
            disabled={step === "template"}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Voltar
          </button>

          {step === "template" && (
            <button
              type="button"
              onClick={() => setStep("data")}
              disabled={!selected}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Continuar
            </button>
          )}
          {step === "data" && (
            <button
              type="button"
              onClick={goPreview}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Continuar
            </button>
          )}
          {step === "preview" && (
            <button
              type="button"
              onClick={generate}
              disabled={generating || blocked || previewLoading}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {generating ? "Gerando..." : "Gerar PDF"}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "template", label: "Modelo" },
    { key: "data", label: "Dados" },
    { key: "preview", label: "Pré-visualização" },
  ]
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full ${s.key === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {i + 1}. {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
        </div>
      ))}
    </div>
  )
}
