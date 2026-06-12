import { useState } from "react"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import type { TabProps } from "../types"
import { patchSettings } from "../types"

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
const labelClass = "block text-sm font-medium text-foreground mb-2"

export default function PortalTab({ settings, onUpdate }: TabProps) {
  const planAllows = settings.planAllowsPatientPortal ?? false
  const [enabled, setEnabled] = useState(settings.patientPortalEnabled ?? false)
  const [minHours, setMinHours] = useState(settings.portalCancelMinHours ?? 24)
  const [saving, setSaving] = useState(false)

  const portalUrl =
    typeof window !== "undefined" ? `${window.location.origin}/paciente/${settings.slug}` : ""

  async function save(next: { patientPortalEnabled?: boolean; portalCancelMinHours?: number }) {
    setSaving(true)
    try {
      const updated = await patchSettings(next)
      onUpdate(updated)
      setEnabled(updated.patientPortalEnabled ?? false)
      setMinHours(updated.portalCancelMinHours ?? 24)
      toast.success("Configurações do portal salvas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
      setEnabled(settings.patientPortalEnabled ?? false)
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(portalUrl)
    toast.success("Link copiado!")
  }

  if (!planAllows) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Portal do Paciente</h2>
        <p className="text-sm text-muted-foreground">
          Seu plano atual não inclui o Portal do Paciente. Faça upgrade para permitir que seus
          pacientes confirmem sessões, baixem faturas e atualizem dados online.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">Habilitar portal</label>
          <p className="text-xs text-muted-foreground">
            Página logada para os pacientes em /paciente/{settings.slug}
          </p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => {
            setEnabled(e.target.checked)
            void save({ patientPortalEnabled: e.target.checked })
          }}
          className="h-5 w-5 accent-brand-600"
        />
      </div>

      <div>
        <label className={labelClass}>Cancelamento permitido até (horas antes)</label>
        <input
          type="number"
          min={1}
          max={168}
          value={minHours}
          onChange={(e) => setMinHours(Number(e.target.value))}
          onBlur={() => {
            if (minHours >= 1 && minHours <= 168) void save({ portalCancelMinHours: minHours })
          }}
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground mt-1">
          O paciente só pode cancelar uma sessão até este prazo antes do horário (1-168h).
        </p>
      </div>

      <div>
        <label className={labelClass}>Link do portal</label>
        <div className="flex items-center gap-2">
          <input readOnly value={portalUrl} className={`${inputClass} text-sm`} />
          <button
            type="button"
            onClick={copyLink}
            className="h-12 px-3 rounded-md border border-border hover:bg-muted transition-colors"
            aria-label="Copiar link"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
