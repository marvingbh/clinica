"use client"

import { useRouter } from "next/navigation"
import { NoteStatusChip } from "@/app/prontuario/components/NoteStatusChip"
import {
  NOTE_TYPE_LABELS,
  NOTE_TYPE_BADGE,
  NOTE_FORMAT_LABELS,
  appointmentStatusLabel,
  formatSessionDateTime,
} from "@/app/prontuario/components/labels"
import type { NoteListItem } from "@/app/prontuario/components/api-types"

export function NoteTimelineItem({ note }: { note: NoteListItem }) {
  const router = useRouter()

  const linkText = note.appointmentScheduledAt
    ? `Sessão de ${formatSessionDateTime(note.appointmentScheduledAt)} — ${appointmentStatusLabel(note.appointmentStatus)}`
    : "Sem vínculo com sessão"

  return (
    <button
      type="button"
      onClick={() => router.push(`/prontuario/${note.id}`)}
      className="w-full text-left rounded-lg border border-border p-4 hover:bg-muted transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-foreground">
          {formatSessionDateTime(note.sessionDate)}
        </span>
        <NoteStatusChip status={note.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${NOTE_TYPE_BADGE[note.noteType]}`}>
          {NOTE_TYPE_LABELS[note.noteType]}
        </span>
        <span className="text-xs text-muted-foreground">{NOTE_FORMAT_LABELS[note.format]}</span>
        {note.addendaCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {note.addendaCount} {note.addendaCount === 1 ? "adendo" : "adendos"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{note.professionalName}</p>
      <p className="text-xs text-muted-foreground">{linkText}</p>
    </button>
  )
}
