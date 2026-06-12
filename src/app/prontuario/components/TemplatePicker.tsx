"use client"

import { HelpTooltip } from "@/shared/components/ui/help-tooltip"
import { NOTE_FORMAT_LABELS, NOTE_FORMAT_DESCRIPTIONS } from "./labels"
import type { NoteTemplateItem } from "./api-types"

interface TemplatePickerProps {
  templates: NoteTemplateItem[]
  selectedId: string | null
  onSelect: (template: NoteTemplateItem) => void
}

/** Cards of available templates, shown only while a draft has no content. Each
 *  card carries its own "?" explaining that template's format (SOAP/DAP/Livre). */
export function TemplatePicker({ templates, selectedId, onSelect }: TemplatePickerProps) {
  if (templates.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Modelo</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          // The "?" is a sibling of the selection button (buttons cannot nest).
          <div key={t.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(t)}
              className={`w-full rounded-lg border py-2 pl-4 pr-9 text-left text-sm transition-colors ${
                selectedId === t.id
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-input bg-background text-foreground hover:bg-muted"
              }`}
            >
              <span className="font-medium">{t.name}</span>
              <span className="block text-xs text-muted-foreground">
                {t.sectionDefs.length} {t.sectionDefs.length === 1 ? "seção" : "seções"}
              </span>
            </button>
            <span className="absolute right-2 top-2">
              <HelpTooltip label={`O que é o formato ${NOTE_FORMAT_LABELS[t.format]}?`} align="right">
                <span className="font-semibold text-foreground">{NOTE_FORMAT_LABELS[t.format]}</span>
                {" — "}
                {NOTE_FORMAT_DESCRIPTIONS[t.format]}
              </HelpTooltip>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
