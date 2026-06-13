"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import type { TabProps } from "../types"
import { patchSettings } from "../types"
import { DEFAULT_RISK_PATIENT_MESSAGE } from "@/lib/scales/risk"

interface ProfessionalOption {
  id: string
  name: string
}

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
const labelClass = "block text-sm font-medium text-foreground mb-2"

export default function ProntuarioTab({ settings, onUpdate }: TabProps) {
  const [years, setYears] = useState(settings.prontuarioRetentionYears)
  const [responsibleId, setResponsibleId] = useState(
    settings.prontuarioResponsibleProfessionalId ?? ""
  )
  const [riskMessage, setRiskMessage] = useState(settings.scaleRiskMessage ?? "")
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useMountEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/professionals")
        if (!res.ok) return
        const data = await res.json()
        const opts: ProfessionalOption[] = (data.professionals ?? [])
          .filter((p: { professionalProfile?: { id: string } }) => p.professionalProfile?.id)
          .map((p: { name: string; professionalProfile: { id: string } }) => ({
            id: p.professionalProfile.id,
            name: p.name,
          }))
        setProfessionals(opts)
      } catch {
        /* non-critical */
      }
    })()
  })

  async function save() {
    setIsSaving(true)
    try {
      const updated = await patchSettings({
        prontuarioRetentionYears: years,
        prontuarioResponsibleProfessionalId: responsibleId || null,
        scaleRiskMessage: riskMessage.trim() ? riskMessage.trim() : null,
      })
      onUpdate(updated)
      toast.success("Configurações de prontuário salvas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setIsSaving(false)
    }
  }

  const dirty =
    years !== settings.prontuarioRetentionYears ||
    responsibleId !== (settings.prontuarioResponsibleProfessionalId ?? "") ||
    riskMessage !== (settings.scaleRiskMessage ?? "")

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <div>
        <label className={labelClass}>Prazo de guarda (anos) *</label>
        <input
          type="number"
          min={5}
          max={20}
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Tempo mínimo de guarda do prontuário após o encerramento (5 a 20 anos; mínimo legal CFP de 5 anos).
        </p>
      </div>
      <div>
        <label className={labelClass}>Profissional responsável por prontuários de profissionais desligados</label>
        <select
          value={responsibleId}
          onChange={(e) => setResponsibleId(e.target.value)}
          className={inputClass}
        >
          <option value="">Nenhum</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Pode ler notas de profissionais inativos (toda leitura é auditada).
        </p>
      </div>
      <div>
        <label className={labelClass}>Mensagem de apoio (resposta de risco)</label>
        <textarea
          rows={5}
          value={riskMessage}
          onChange={(e) => setRiskMessage(e.target.value)}
          placeholder={DEFAULT_RISK_PATIENT_MESSAGE}
          className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Exibida ao paciente quando uma resposta de escala clínica indica risco. Deixe em
          branco para usar a mensagem padrão (com o CVV — 188).
        </p>
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={save}
          disabled={isSaving || !dirty || years < 5 || years > 20}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isSaving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  )
}
