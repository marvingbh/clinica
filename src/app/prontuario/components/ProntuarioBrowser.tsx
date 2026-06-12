"use client"

import { useRef, useState } from "react"
import { Search } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { Pagination } from "@/shared/components/ui/pagination"
import { PendingNotesList } from "./PendingNotesList"
import { NoteBrowserItem } from "./NoteBrowserItem"
import type { NoteListItem } from "./api-types"

type Filter = "PENDENTE" | "RASCUNHO" | "ASSINADA"
const PAGE_SIZE = 20

const FILTERS: { key: Filter; label: string }[] = [
  { key: "PENDENTE", label: "Pendentes" },
  { key: "RASCUNHO", label: "Rascunhos" },
  { key: "ASSINADA", label: "Assinadas" },
]

interface PendingItem {
  appointmentId: string
  patientId: string
  patientName: string | null
  scheduledAt: string
}

export function ProntuarioBrowser() {
  const [filter, setFilter] = useState<Filter>("PENDENTE")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0) // 0-based, matches <Pagination>
  const [pending, setPending] = useState<PendingItem[]>([])
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqRef = useRef(0)

  useMountEffect(() => {
    void load(filter, search, 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  })

  async function load(f: Filter, q: string, p: number) {
    const reqId = ++reqRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p + 1), pageSize: String(PAGE_SIZE) })
      const term = q.trim()
      if (term) params.set("search", term)
      let url: string
      if (f === "PENDENTE") {
        url = `/api/prontuario/pending?${params}`
      } else {
        params.set("status", f)
        url = `/api/prontuario/notes?${params}`
      }
      const res = await fetch(url)
      const data = res.ok ? await res.json() : {}
      if (reqId !== reqRef.current) return // a newer request superseded this one
      if (f === "PENDENTE") {
        setPending(data.pending ?? [])
        setNotes([])
      } else {
        setNotes(data.notes ?? [])
        setPending([])
      }
      setTotal(data.total ?? 0)
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }

  function changeFilter(f: Filter) {
    setFilter(f)
    setPage(0)
    void load(f, search, 0)
  }

  function changeSearch(value: string) {
    setSearch(value)
    setPage(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void load(filter, value, 0), 300)
  }

  function changePage(p: number) {
    setPage(p)
    void load(filter, search, p)
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
          placeholder="Buscar por nome do paciente"
          className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => changeFilter(f.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : filter === "PENDENTE" ? (
        <PendingNotesList pending={pending} />
      ) : notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum registro encontrado.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteBrowserItem key={note.id} note={note} />
          ))}
        </div>
      )}

      {!loading && (
        <div className="mt-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={changePage} />
        </div>
      )}
    </div>
  )
}
