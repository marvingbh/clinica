"use client"

import { SessionItemsPicker } from "./SessionItemsPicker"
import { MANUAL_FIELD_LABELS, manualKeysInBody, bodyUsesSessions } from "./manual-fields"

interface Props {
  patientId: string
  templateBody: string
  manualFields: Record<string, string>
  onManualChange: (key: string, value: string) => void
  selectedItemIds: string[]
  onItemsChange: (ids: string[]) => void
}

const SHORT_FIELDS = new Set(["finalidade", "destinatario", "tussCode", "periodoAfastamento"])

export function DocumentDataStep({
  patientId,
  templateBody,
  manualFields,
  onManualChange,
  selectedItemIds,
  onItemsChange,
}: Props) {
  const manualKeys = manualKeysInBody(templateBody)
  const usesSessions = bodyUsesSessions(templateBody)

  return (
    <div className="space-y-5">
      {usesSessions && (
        <div>
          <h4 className="text-sm font-medium mb-2">Sessões pagas</h4>
          <SessionItemsPicker patientId={patientId} selectedIds={selectedItemIds} onChange={onItemsChange} />
        </div>
      )}

      {manualKeys.map((key) => (
        <label key={key} className="block text-sm">
          <span className="block text-foreground font-medium mb-1">{MANUAL_FIELD_LABELS[key]}</span>
          {SHORT_FIELDS.has(key) ? (
            <input
              type="text"
              value={manualFields[key] ?? ""}
              onChange={(e) => onManualChange(key, e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          ) : (
            <textarea
              value={manualFields[key] ?? ""}
              onChange={(e) => onManualChange(key, e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          )}
        </label>
      ))}

      {!usesSessions && manualKeys.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Este documento não exige dados adicionais. Avance para a pré-visualização.
        </p>
      )}
    </div>
  )
}
