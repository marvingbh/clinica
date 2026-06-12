"use client"

import { useState } from "react"
import { toast } from "sonner"
import { formatSessionDateTime } from "./labels"
import type { NoteAddendumItem } from "./api-types"

interface AddendumListProps {
  noteId: string
  addenda: NoteAddendumItem[]
  canAdd: boolean
  onAdded: (addendum: NoteAddendumItem) => void
}

export function AddendumList({ noteId, addenda, canAdd, onAdded }: AddendumListProps) {
  const [content, setContent] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!content.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/prontuario/notes/${noteId}/addenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      onAdded(data.addendum)
      setContent("")
      toast.success("Adendo adicionado.")
    } catch {
      toast.error("Não foi possível adicionar o adendo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Adendos</h4>
      {addenda.length === 0 && <p className="text-xs text-muted-foreground">Nenhum adendo.</p>}
      {addenda.map((a) => (
        <div key={a.id} className="rounded-md border border-border p-3">
          <p className="whitespace-pre-wrap text-sm text-foreground">{a.content}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {a.authorName ?? "Autor"} · {formatSessionDateTime(a.createdAt)}
          </p>
        </div>
      ))}
      {canAdd && (
        <div className="space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={10_000}
            placeholder="Escreva o adendo..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !content.trim()}
            className="h-9 rounded-md border border-input bg-background px-4 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            Adicionar adendo
          </button>
        </div>
      )}
    </div>
  )
}
