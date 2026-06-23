"use client"

import { useRef, useState } from "react"
import { useSession } from "next-auth/react"
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

interface ProfessionalOption {
  id: string
  name: string
}

/** DD/MM/AAAA → YYYY-MM-DD (or null if not a complete valid date). */
function brToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo}-${d}`
}

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"

export function ProntuarioBrowser() {
  const { data: session } = useSession()
  const sUser = session?.user as { professionalProfileId?: string | null } | undefined
  // Selector is for admins only (accounts without a treating professional profile).
  // A logged-in professional sees only their own pendings — no selector.
  const isDirector = !sUser?.professionalProfileId

  const [filter, setFilter] = useState<Filter>("PENDENTE")
  const [search, setSearch] = useState("")
  const [prof, setProf] = useState("") // "" = todos
  const [fromText, setFromText] = useState("")
  const [toText, setToText] = useState("")
  const [page, setPage] = useState(0) // 0-based, matches <Pagination>
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([])
  const [pending, setPending] = useState<PendingItem[]>([])
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqRef = useRef(0)

  useMountEffect(() => {
    void load(filter, search, 0, prof, fromText, toText)
    if (isDirector) {
      fetch("/api/professionals")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          // The endpoint returns { professionals: [...] } (same as the agenda).
          type ProfApi = { name: string; professionalProfile?: { id?: string } | null }
          const arr: ProfApi[] = Array.isArray(data) ? data : (data?.professionals ?? [])
          const list: ProfessionalOption[] = arr
            .filter((p) => !!p.professionalProfile?.id)
            .map((p) => ({ id: p.professionalProfile!.id as string, name: p.name }))
          setProfessionals(list)
        })
        .catch(() => {})
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  })

  async function load(f: Filter, q: string, p: number, pr: string, fromT: string, toT: string) {
    const reqId = ++reqRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p + 1), pageSize: String(PAGE_SIZE) })
      const term = q.trim()
      if (term) params.set("search", term)
      if (pr) params.set("professionalProfileId", pr)
      const fromIso = brToIso(fromT)
      const toIso = brToIso(toT)
      if (fromIso) params.set("from", fromIso)
      if (toIso) params.set("to", toIso)

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

  function reload(p: number, overrides: Partial<{ f: Filter; q: string; pr: string; fromT: string; toT: string }> = {}) {
    void load(
      overrides.f ?? filter,
      overrides.q ?? search,
      p,
      overrides.pr ?? prof,
      overrides.fromT ?? fromText,
      overrides.toT ?? toText
    )
  }

  function changeFilter(f: Filter) {
    setFilter(f)
    setPage(0)
    reload(0, { f })
  }

  function changeSearch(value: string) {
    setSearch(value)
    setPage(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => reload(0, { q: value }), 300)
  }

  function changeProf(value: string) {
    setProf(value)
    setPage(0)
    reload(0, { pr: value })
  }

  function changeDate(which: "from" | "to", value: string) {
    if (which === "from") setFromText(value)
    else setToText(value)
    setPage(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(
      () => reload(0, which === "from" ? { fromT: value } : { toT: value }),
      400
    )
  }

  function changePage(p: number) {
    setPage(p)
    reload(p)
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

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {isDirector && (
          <select
            value={prof}
            onChange={(e) => changeProf(e.target.value)}
            className={inputClass}
            aria-label="Filtrar por profissional"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          inputMode="numeric"
          value={fromText}
          onChange={(e) => changeDate("from", e.target.value)}
          placeholder="De (DD/MM/AAAA)"
          className={inputClass}
          aria-label="Data inicial"
        />
        <input
          type="text"
          inputMode="numeric"
          value={toText}
          onChange={(e) => changeDate("to", e.target.value)}
          placeholder="Até (DD/MM/AAAA)"
          className={inputClass}
          aria-label="Data final"
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
        <PendingNotesList pending={pending} canRegister={!isDirector} />
      ) : notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>
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
