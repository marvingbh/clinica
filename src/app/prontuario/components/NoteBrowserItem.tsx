"use client"

import { useRouter } from "next/navigation"
import { NoteStatusChip } from "./NoteStatusChip"
import {
  NOTE_TYPE_LABELS,
  NOTE_TYPE_BADGE,
  NOTE_FORMAT_LABELS,
  formatSessionDateTime,
} from "./labels"
import type { NoteListItem } from "./api-types"

/** A clinical-note row for the cross-patient browser — leads with the patient
 *  name (unlike the per-patient timeline item). Opens the note editor/viewer. */
export function NoteBrowserItem({ note }: { note: NoteListItem }) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.push(`/prontuario/${note.id}`)}
      className="w-full text-left rounded-lg border border-border p-4 hover:bg-muted transition-colors"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {note.patientName ?? "Paciente"}
        </span>
        <NoteStatusChip status={note.status} />
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${NOTE_TYPE_BADGE[note.noteType]}`}
        >
          {NOTE_TYPE_LABELS[note.noteType]}
        </span>
        <span className="text-xs text-muted-foreground">{NOTE_FORMAT_LABELS[note.format]}</span>
        {note.addendaCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {note.addendaCount} {note.addendaCount === 1 ? "adendo" : "adendos"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{formatSessionDateTime(note.sessionDate)}</p>
    </button>
  )
}
