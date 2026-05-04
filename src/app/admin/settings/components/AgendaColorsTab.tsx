"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckIcon } from "@/shared/components/ui/icons"
import {
  AGENDA_COLOR_SLOTS,
  PALETTE_NAMES,
  type AgendaColorSlot,
  type AgendaColors,
  type PaletteName,
} from "@/lib/clinic/colors/types"
import {
  PALETTE_CLASSES,
  PALETTE_LABELS_PT_BR,
} from "@/lib/clinic/colors/palette"
import type { TabProps } from "../types"
import { patchSettings } from "../types"

const SLOT_LABELS: Record<AgendaColorSlot, string> = {
  consulta: "Consulta",
  reuniao: "Reunião",
  lembrete: "Lembrete",
  groupSession: "Sessão em grupo",
  availability: "Disponível",
  todo: "Tarefa",
}

const SLOT_DESCRIPTIONS: Record<AgendaColorSlot, string> = {
  consulta: "Cor das consultas individuais na agenda",
  reuniao: "Cor das reuniões e supervisões",
  lembrete: "Cor dos blocos de lembrete",
  groupSession: "Cor das sessões em grupo (KEEP, MERCÚRIO etc.)",
  availability: "Cor dos horários disponíveis para agendamento",
  todo: "Cor da faixa lateral nas tarefas da agenda (Tarefas)",
}

export default function AgendaColorsTab({ settings, onUpdate }: TabProps) {
  const [draft, setDraft] = useState<AgendaColors>(settings.agendaColors)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = useMemo(
    () =>
      AGENDA_COLOR_SLOTS.some((slot) => draft[slot] !== settings.agendaColors[slot]),
    [draft, settings.agendaColors],
  )

  function pick(slot: AgendaColorSlot, name: PaletteName) {
    setDraft((prev) => ({ ...prev, [slot]: name }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isDirty || isSaving) return
    setIsSaving(true)
    try {
      const updated = await patchSettings({ agendaColors: draft })
      onUpdate(updated)
      toast.success("Cores da agenda salvas")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setIsSaving(false)
    }
  }

  function reset() {
    setDraft(settings.agendaColors)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Estas cores são usadas na agenda quando você visualiza um profissional específico.
        Ao selecionar &ldquo;Todos&rdquo; cada profissional recebe uma cor única automaticamente.
      </p>

      <div className="space-y-5">
        {AGENDA_COLOR_SLOTS.map((slot) => {
          const selected = draft[slot]
          return (
            <fieldset key={slot} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <legend className="text-sm font-semibold text-foreground">
                  {SLOT_LABELS[slot]}
                </legend>
                <span className="text-[11px] text-muted-foreground">
                  {PALETTE_LABELS_PT_BR[selected]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {SLOT_DESCRIPTIONS[slot]}
              </p>
              <PaletteSwatchGrid
                value={selected}
                onChange={(name) => pick(slot, name)}
                ariaLabel={`Cor para ${SLOT_LABELS[slot]}`}
              />
              {/* Preview chip in the chosen palette */}
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border-l-[3px] text-xs font-medium ${PALETTE_CLASSES[selected].bg} ${PALETTE_CLASSES[selected].borderLeft} ${PALETTE_CLASSES[selected].text}`}
                >
                  <span className={`w-2 h-2 rounded-full ${PALETTE_CLASSES[selected].accent}`} />
                  Pré-visualização — {SLOT_LABELS[slot]}
                </span>
              </div>
            </fieldset>
          )
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!isDirty || isSaving}
          className="px-5 h-11 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Salvando..." : "Salvar cores"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!isDirty || isSaving}
          className="px-5 h-11 rounded-md border border-border bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Restaurar
        </button>
      </div>
    </form>
  )
}

/**
 * Inlined swatch grid — used only by AgendaColorsTab. No need for a separate
 * component file. Focus ring uses neutral `ring-ring` so picking yellow
 * doesn't make the focus indicator invisible.
 */
function PaletteSwatchGrid({
  value,
  onChange,
  ariaLabel,
}: {
  value: PaletteName
  onChange: (name: PaletteName) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-9 gap-1.5">
      {PALETTE_NAMES.map((name) => {
        const isActive = name === value
        // The "white" palette uses bg-white for the actual block but the
        // swatch dot uses its `accent` (bg-black) so it's visible in the grid.
        // Other palettes use their `accent` (bg-{color}-500). All swatches
        // get a thin border so light palettes (yellow, lime, white) don't
        // disappear against the card background.
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={PALETTE_LABELS_PT_BR[name]}
            title={PALETTE_LABELS_PT_BR[name]}
            onClick={() => onChange(name)}
            className={`relative w-8 h-8 rounded-full border border-border ${PALETTE_CLASSES[name].accent} ring-offset-2 ring-offset-card transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive ? "ring-2 ring-ring shadow-md" : ""
            }`}
          >
            {isActive && (
              <span className="absolute inset-0 grid place-items-center text-white">
                <CheckIcon className="w-4 h-4" strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
