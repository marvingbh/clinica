"use client"

import { CHOICE_TYPES, type FormField, type FormFieldCondition } from "@/lib/forms"

interface ConditionEditorProps {
  /** Fields that appear BEFORE the field being edited (valid condition targets). */
  priorFields: FormField[]
  value: FormFieldCondition | undefined
  onChange: (condition: FormFieldCondition | undefined) => void
}

/** Edits a field's visibleWhen condition (show only when a prior answer equals X). */
export function ConditionEditor({ priorFields, value, onChange }: ConditionEditorProps) {
  const eligible = priorFields.filter((f) => f.type !== "section" && f.type !== "info_consent")
  const target = eligible.find((f) => f.id === value?.fieldId)

  function valueOptionsFor(field: FormField | undefined): string[] {
    if (!field) return []
    if (field.type === "yes_no") return ["Sim", "Não"]
    if (CHOICE_TYPES.has(field.type)) return field.options ?? []
    return []
  }

  function toEquals(field: FormField | undefined, raw: string): string | boolean {
    if (field?.type === "yes_no") return raw === "Sim"
    return raw
  }

  function fromEquals(equals: string | number | boolean | undefined): string {
    if (equals === true) return "Sim"
    if (equals === false) return "Não"
    return equals === undefined ? "" : String(equals)
  }

  if (eligible.length === 0) {
    return <p className="text-[12px] text-ink-400">Adicione campos antes para criar condições.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-[13px] text-ink-700">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => {
            if (e.target.checked) onChange({ fieldId: eligible[0].id, equals: fromEquals(undefined) || "" })
            else onChange(undefined)
          }}
        />
        Mostrar somente quando…
      </label>
      {value && (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <select
            value={value.fieldId}
            onChange={(e) => onChange({ fieldId: e.target.value, equals: "" })}
            className="rounded-lg border border-ink-200 px-2 py-1.5 text-[13px]"
          >
            {eligible.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="text-[13px] text-ink-500">for igual a</span>
          {valueOptionsFor(target).length > 0 ? (
            <select
              value={fromEquals(value.equals)}
              onChange={(e) => onChange({ fieldId: value.fieldId, equals: toEquals(target, e.target.value) })}
              className="rounded-lg border border-ink-200 px-2 py-1.5 text-[13px]"
            >
              <option value="">Selecione...</option>
              {valueOptionsFor(target).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={fromEquals(value.equals)}
              onChange={(e) => onChange({ fieldId: value.fieldId, equals: e.target.value })}
              className="rounded-lg border border-ink-200 px-2 py-1.5 text-[13px]"
            />
          )}
        </div>
      )}
    </div>
  )
}
