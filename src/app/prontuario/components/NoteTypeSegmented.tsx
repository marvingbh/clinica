"use client"

import { Segmented } from "@/shared/components/ui/segmented"
import { NOTE_TYPE_LABELS } from "./labels"
import type { ClinicalNoteType } from "@/lib/prontuario"

interface NoteTypeSegmentedProps {
  value: ClinicalNoteType
  onChange: (value: ClinicalNoteType) => void
  disabled?: boolean
}

const OPTIONS: { value: ClinicalNoteType; label: string }[] = (
  ["EVOLUCAO", "AVALIACAO", "ENCERRAMENTO", "OUTRO"] as ClinicalNoteType[]
).map((v) => ({ value: v, label: NOTE_TYPE_LABELS[v] }))

export function NoteTypeSegmented({ value, onChange, disabled }: NoteTypeSegmentedProps) {
  if (disabled) {
    return <span className="text-sm text-foreground">{NOTE_TYPE_LABELS[value]}</span>
  }
  return (
    <Segmented<ClinicalNoteType>
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Tipo de registro"
    />
  )
}
