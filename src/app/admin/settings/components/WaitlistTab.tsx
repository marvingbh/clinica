import { useState } from "react"
import { toast } from "sonner"
import type { TabProps } from "../types"
import { patchSettings } from "../types"
import { DEFAULT_WAITLIST_SETTINGS, type WaitlistSettings } from "@/lib/waitlist"

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
const labelClass = "block text-sm font-medium text-foreground mb-2"

export default function WaitlistTab({ settings, onUpdate }: TabProps) {
  const gateOn = settings.appointmentNotificationsEnabled ?? false
  const current = settings.waitlistSettings ?? DEFAULT_WAITLIST_SETTINGS
  const [draft, setDraft] = useState<WaitlistSettings>(current)
  const [saving, setSaving] = useState(false)

  async function save(next: Partial<WaitlistSettings>) {
    const merged = { ...draft, ...next }
    setDraft(merged)
    setSaving(true)
    try {
      const updated = await patchSettings({ waitlistSettings: merged })
      onUpdate(updated)
      toast.success("Configurações da lista de espera salvas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
      setDraft(current)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Lista de espera</h2>
        <p className="text-sm text-muted-foreground">
          Como o sistema reage quando uma sessão futura é cancelada.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Modo de operação</legend>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="waitlist-mode"
            checked={draft.mode === "TRIAGEM"}
            disabled={saving}
            onChange={() => save({ mode: "TRIAGEM" })}
            className="mt-1 accent-brand-600"
          />
          <span>
            <span className="font-medium">Triagem manual</span>
            <span className="block text-xs text-muted-foreground">
              Cria uma tarefa para a equipe com os candidatos. Sem mensagens automáticas.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="waitlist-mode"
            checked={draft.mode === "OFERTA_AUTOMATICA"}
            disabled={saving || !gateOn}
            onChange={() => save({ mode: "OFERTA_AUTOMATICA" })}
            className="mt-1 accent-brand-600"
          />
          <span>
            <span className="font-medium">Oferta automática</span>
            <span className="block text-xs text-muted-foreground">
              {gateOn
                ? "Envia a oferta de horário ao melhor candidato automaticamente."
                : "Disponível somente quando as notificações de agendamento estiverem ativas."}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Estratégia de oferta</legend>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="waitlist-strategy"
            checked={draft.strategy === "SEQUENCIAL"}
            disabled={saving}
            onChange={() => save({ strategy: "SEQUENCIAL" })}
            className="accent-brand-600"
          />
          Sequencial (um por vez)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="waitlist-strategy"
            checked={draft.strategy === "BROADCAST"}
            disabled={saving}
            onChange={() => save({ strategy: "BROADCAST" })}
            className="accent-brand-600"
          />
          Todos de uma vez (primeiro que aceitar leva)
        </label>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Janela de exclusividade (horas)</label>
          <input
            type="number"
            min={1}
            max={72}
            value={draft.holdHours}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, holdHours: Number(e.target.value) })}
            onBlur={() => {
              if (draft.holdHours >= 1 && draft.holdHours <= 72) save({ holdHours: draft.holdHours })
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Antecedência mínima (horas)</label>
          <input
            type="number"
            min={0}
            max={168}
            value={draft.minNoticeHours}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, minNoticeHours: Number(e.target.value) })}
            onBlur={() => {
              if (draft.minNoticeHours >= 0 && draft.minNoticeHours <= 168)
                save({ minNoticeHours: draft.minNoticeHours })
            }}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Horários vagando com menos antecedência entram apenas na triagem.
          </p>
        </div>
      </div>
    </div>
  )
}
