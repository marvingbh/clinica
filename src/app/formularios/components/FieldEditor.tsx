"use client"

import { CHOICE_TYPES, FIELD_TYPE_LABELS, type FormField } from "@/lib/forms"
import { ConditionEditor } from "./ConditionEditor"

interface FieldEditorProps {
  field: FormField
  priorFields: FormField[]
  onChange: (patch: Partial<FormField>) => void
  onRemove: () => void
}

const inputClass = "w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-ink-400"

/** Inline editor for a single field's properties. */
export function FieldEditor({ field, priorFields, onChange, onRemove }: FieldEditorProps) {
  const hasOptions = CHOICE_TYPES.has(field.type)
  const canRequire = field.type !== "section"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">{FIELD_TYPE_LABELS[field.type]}</span>
        <button onClick={onRemove} className="text-[12px] text-red-500 hover:underline">
          Remover
        </button>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-ink-600">Título</label>
        <input className={inputClass} value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>

      {field.type !== "info_consent" && (
        <div>
          <label className="block text-[12px] font-medium text-ink-600">Descrição (opcional)</label>
          <input
            className={inputClass}
            value={field.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value || undefined })}
          />
        </div>
      )}

      {field.type === "info_consent" && (
        <div>
          <label className="block text-[12px] font-medium text-ink-600">Texto do termo</label>
          <textarea
            className={`${inputClass} min-h-[100px]`}
            value={field.infoText ?? ""}
            onChange={(e) => onChange({ infoText: e.target.value })}
          />
        </div>
      )}

      {hasOptions && (
        <div>
          <label className="block text-[12px] font-medium text-ink-600">Opções (uma por linha)</label>
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={(field.options ?? []).join("\n")}
            onChange={(e) =>
              onChange({ options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
            }
          />
        </div>
      )}

      {canRequire && (
        <label className="flex items-center gap-2 text-[13px] text-ink-700">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Obrigatório
        </label>
      )}

      {field.type !== "section" && (
        <ConditionEditor
          priorFields={priorFields}
          value={field.visibleWhen}
          onChange={(condition) => onChange({ visibleWhen: condition })}
        />
      )}
    </div>
  )
}
