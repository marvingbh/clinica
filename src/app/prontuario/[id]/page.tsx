"use client"

import { use, useCallback, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import { useRequireAuth } from "@/shared/hooks"
import { NoteEditor } from "../components/NoteEditor"
import type { NoteDetail, NoteAddendumItem, NoteTemplateItem } from "../components/api-types"

interface LoadedData {
  note: NoteDetail
  addenda: NoteAddendumItem[]
  templates: NoteTemplateItem[]
}

export default function NoteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { isReady } = useRequireAuth({ feature: "prontuario", minAccess: "READ" })
  const [data, setData] = useState<LoadedData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [noteRes, tplRes] = await Promise.all([
        fetch(`/api/prontuario/notes/${id}`),
        fetch("/api/prontuario/templates"),
      ])
      if (noteRes.status === 403) {
        setError("Você não tem permissão para acessar o prontuário.")
        return
      }
      if (!noteRes.ok) {
        setError("Registro não encontrado.")
        return
      }
      const noteData = await noteRes.json()
      const tplData = tplRes.ok ? await tplRes.json() : { templates: [] }
      setData({
        note: noteData.note,
        addenda: noteData.addenda ?? [],
        templates: tplData.templates ?? [],
      })
    } catch {
      toast.error("Erro ao carregar o registro.")
      setError("Erro ao carregar o registro.")
    }
  }, [id])

  // Auth-readiness data fetch: only fetch the note once auth is confirmed, and
  // re-run when isReady flips true on a direct page load/refresh.
  useEffect(() => {
    if (!isReady) return
    void load()
  }, [isReady, load])

  if (!isReady) {
    return <div className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : data ? (
        <NoteEditor
          key={data.note.id}
          initialNote={data.note}
          initialAddenda={data.addenda}
          templates={data.templates}
        />
      ) : (
        <div className="space-y-3">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded bg-muted" />
        </div>
      )}
    </div>
  )
}
