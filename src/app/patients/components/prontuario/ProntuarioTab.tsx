"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, FileDown } from "lucide-react"
import { useMountEffect, usePermission } from "@/shared/hooks"
import { NoteTimelineItem } from "./NoteTimelineItem"
import { RetentionPanel } from "./RetentionPanel"
import type { NoteListItem } from "@/app/prontuario/components/api-types"

interface ProntuarioTabProps {
  patientId: string
  recordClosedAt: string | null
}

function brToIso(value: string): string | null {
  const parts = value.split("/")
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y || y.length !== 4) return null
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function ProntuarioTab({ patientId, recordClosedAt }: ProntuarioTabProps) {
  const router = useRouter()
  const { canWrite, canRead } = usePermission("prontuario")
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ patientId })
      const fromIso = brToIso(from)
      const toIso = brToIso(to)
      if (fromIso) params.set("from", fromIso)
      if (toIso) params.set("to", toIso)
      const res = await fetch(`/api/prontuario/notes?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotes(data.notes ?? [])
    } catch {
      toast.error("Erro ao carregar registros clínicos.")
    } finally {
      setIsLoading(false)
    }
  }, [patientId, from, to])

  useMountEffect(() => {
    if (canRead) fetchNotes()
    else setIsLoading(false)
  })

  async function handleNewNote() {
    setCreating(true)
    try {
      const res = await fetch("/api/prontuario/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422) {
        toast.error(data.error ?? "Não foi possível criar a anotação.")
        return
      }
      if (!res.ok) throw new Error()
      router.push(`/prontuario/${data.note.id}`)
    } catch {
      toast.error("Erro ao criar anotação.")
    } finally {
      setCreating(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      const fromIso = brToIso(from)
      const toIso = brToIso(to)
      if (fromIso) params.set("from", fromIso)
      if (toIso) params.set("to", toIso)
      const qs = params.toString()
      const res = await fetch(`/api/prontuario/record/${patientId}/pdf${qs ? `?${qs}` : ""}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível exportar o prontuário.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "prontuario.pdf"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Não foi possível exportar o prontuário.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Lifecycle panel: visible to staff with the "patients" feature even
          when they cannot read clinical content (ADMIN default). */}
      <RetentionPanel
        patientId={patientId}
        recordClosedAt={recordClosedAt}
        onChanged={() => router.refresh()}
      />

      {!canRead ? (
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar o conteúdo do prontuário.
        </p>
      ) : (
      <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">
            De
            <input
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 h-9 w-32 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Até
            <input
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 h-9 w-32 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={fetchNotes}
            className="mt-auto h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-muted"
          >
            Filtrar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            title="Exportar o prontuário (registros assinados) em PDF"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            <FileDown className="h-4 w-4" /> {exporting ? "Exportando..." : "Exportar PDF"}
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={handleNewNote}
              disabled={creating}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> Nova anotação
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum registro clínico para este paciente.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteTimelineItem key={note.id} note={note} />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
