"use client"

import type { NoteTemplateItem } from "./api-types"

interface TemplatePickerProps {
  templates: NoteTemplateItem[]
  selectedId: string | null
  onSelect: (template: NoteTemplateItem) => void
}

/** Cards of available templates, shown only while a draft has no content. */
export function TemplatePicker({ templates, selectedId, onSelect }: TemplatePickerProps) {
  if (templates.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Modelo</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
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
        ))}
      </div>
    </div>
  )
}
