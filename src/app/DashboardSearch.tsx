"use client"

import { useCallback, useRef, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import Link from "next/link"
import {
  SearchIcon,
  UserIcon,
  ReceiptIcon,
  XIcon,
  LoaderIcon,
} from "@/shared/components/ui/icons"
import { Input } from "@/shared/components/ui/input"
import { formatCurrencyBRL, getMonthNameShort } from "@/lib/financeiro/format"

interface PatientHit {
  id: string
  name: string
  phone: string
  email: string | null
}
interface InvoiceHit {
  id: string
  referenceMonth: number
  referenceYear: number
  totalAmount: string
  status: string
  patientName: string
}
interface SearchResults {
  patients: PatientHit[]
  invoices: InvoiceHit[]
}

const STATUS_TONE: Record<string, string> = {
  PAGO: "bg-ok-50 text-ok-700 border-ok-100",
  ENVIADO: "bg-brand-50 text-brand-700 border-brand-100",
  PARCIAL: "bg-warn-50 text-warn-700 border-warn-100",
  PENDENTE: "bg-ink-100 text-ink-700 border-ink-200",
  CANCELADO: "bg-err-50 text-err-700 border-err-100",
}

/** Omnisearch input for the dashboard header — debounced, keyboard-friendly,
 *  results surface in a dropdown with Pacientes + Faturas sections. */
export function DashboardSearch() {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounce query → debounced.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Fetch whenever the debounced query changes.
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) {
        setResults({ patients: [], invoices: [] })
        return
      }
      const data = await res.json()
      setResults(data)
    } finally {
      setLoading(false)
    }
  }, [])


  useEffect(() => {
    if (debounced) {
      void search(debounced)
    } else {
      setResults(null)
    }
  }, [debounced, search])

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  // Close on escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const showDropdown = open && debounced.length >= 2
  const hasHits =
    results && (results.patients.length > 0 || results.invoices.length > 0)

  return (
    <div ref={containerRef} className="relative w-full sm:w-[260px]">
      <Input
        leftIcon={<SearchIcon className="w-4 h-4" />}
        rightIcon={
          loading ? (
            <LoaderIcon className="w-3.5 h-3.5 animate-spin text-ink-400" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setResults(null)
              }}
              aria-label="Limpar busca"
              className="text-ink-400 hover:text-ink-700 transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          ) : undefined
        }
        placeholder="Buscar pacientes ou faturas…"
        inputSize="md"
        aria-label="Buscar"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />

      {showDropdown && (
        <div className="absolute right-0 left-0 top-full mt-1.5 z-30 bg-card border border-ink-200 rounded-[6px] shadow-lg overflow-hidden max-h-[420px] overflow-y-auto">
          {!results && loading && (
            <div className="p-4 text-center text-[12px] text-ink-500">Buscando…</div>
          )}
          {results && !hasHits && (
            <div className="p-4 text-center text-[12px] text-ink-500">
              Nenhum resultado para <strong className="text-ink-800">{debounced}</strong>.
            </div>
          )}
          {results && results.patients.length > 0 && (
            <div>
              <SectionLabel>Pacientes · {results.patients.length}</SectionLabel>
              {results.patients.map((p) => (
                <Link
                  key={p.id}
                  href={`/patients/${p.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 border border-brand-200 grid place-items-center text-[11px] font-semibold flex-shrink-0">
                    {getInitials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink-900 truncate">{p.name}</div>
                    <div className="text-[11px] text-ink-500 font-mono truncate">
                      {p.phone}
                      {p.email && <> · {p.email}</>}
                    </div>
                  </div>
                  <UserIcon className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
          {results && results.invoices.length > 0 && (
            <div className="border-t border-ink-100">
              <SectionLabel>Faturas · {results.invoices.length}</SectionLabel>
              {results.invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/financeiro/faturas/${inv.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-[4px] bg-ink-100 text-ink-600 border border-ink-200 grid place-items-center flex-shrink-0">
                    <ReceiptIcon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink-900 truncate">
                      {inv.patientName}
                    </div>
                    <div className="text-[11px] text-ink-500 font-mono truncate">
                      {getMonthNameShort(inv.referenceMonth)}/{inv.referenceYear} ·{" "}
                      {formatCurrencyBRL(Number(inv.totalAmount))}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                      STATUS_TONE[inv.status] || "bg-ink-100 text-ink-700 border-ink-200"
                    }`}
                  >
                    {inv.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 bg-ink-50 border-b border-ink-100">
      {children}
    </div>
  )
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
}
