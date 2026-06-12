"use client"

import { NoteStatusChip } from "./NoteStatusChip"
import { appointmentStatusLabel, formatSessionDateTime } from "./labels"
import type { NoteDetail } from "./api-types"

interface NoteEditorHeaderProps {
  note: NoteDetail
  saveLabel: string
}

export function NoteEditorHeader({ note, saveLabel }: NoteEditorHeaderProps) {
  const linkText = note.appointmentScheduledAt
    ? `Sessão de ${formatSessionDateTime(note.appointmentScheduledAt)} — ${appointmentStatusLabel(note.appointmentStatus)}`
    : `Sessão de ${formatSessionDateTime(note.sessionDate)} — Sem vínculo com sessão`

  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground">{note.patientName ?? "Paciente"}</h1>
        <div className="flex items-center gap-2">
          <NoteStatusChip status={note.status} />
          <span className="text-xs text-muted-foreground">{saveLabel}</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{linkText}</p>
      {note.status === "ASSINADA" && note.signedAt && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Assinada por {note.signedByName ?? "profissional"} em {formatSessionDateTime(note.signedAt)}
        </p>
      )}
    </header>
  )
}
