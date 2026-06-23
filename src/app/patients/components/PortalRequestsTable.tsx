"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Search } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { Button } from "@/shared/components/ui/button"
import { Pagination } from "@/shared/components/ui/pagination"

interface PortalRequestRow {
  id: string
  type: string
  status: string
  summary: string
  patientName: string
  appointmentAt: string | null
  createdAt: string
  resolvedAt: string | null
  resolutionNotes: string | null
}

const PAGE_SIZE = 30

type StatusFilter = "PENDING" | "RESOLVED" | "REJECTED"

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "PENDING", label: "Pendentes" },
  { key: "RESOLVED", label: "Resolvidas" },
  { key: "REJECTED", label: "Rejeitadas" },
]

const TYPE_LABELS: Record<string, string> = {
  RESCHEDULE: "Reagendamento",
  UPDATE_DATA: "Atualização de dados",
  LGPD_EXPORT: "Dados (LGPD)",
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  RESOLVED: "Resolvida",
  REJECTED: "Rejeitada",
}

const DELAYED_AFTER_MS = 2 * 24 * 60 * 60 * 1000 // pendente há mais de 2 dias = atrasada

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function relativeAge(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return "há instantes"
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days > 1 ? "s" : ""}`
}

export function PortalRequestsTable({ canWrite }: { canWrite: boolean }) {
  const [filter, setFilter] = useState<StatusFilter>("PENDING")
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<PortalRequestRow[]>([])
  const [page, setPage] = useState(0) // 0-based (matches <Pagination>)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(status: StatusFilter, p: number, q: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status, page: String(p + 1) })
      if (q.trim()) params.set("search", q.trim())
      const res = await fetch(`/api/portal-requests?${params}`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setRows(data.requests ?? [])
        setTotal(data.total ?? 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useMountEffect(() => {
    void load(filter, 0, search)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  })

  function changeFilter(f: StatusFilter) {
    setFilter(f)
    setPage(0)
    void load(f, 0, search)
  }

  function changeSearch(value: string) {
    setSearch(value)
    setPage(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void load(filter, 0, value), 300)
  }

  function changePage(p: number) {
    setPage(p)
    void load(filter, p, search)
  }

  async function act(id: string, action: "apply" | "resolve" | "reject") {
    setBusyId(id)
    try {
      const res = await fetch(`/api/portal-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível concluir a ação.")
        return
      }
      toast.success("Solicitação atualizada.")
      await load(filter, page, search)
    } catch {
      toast.error("Erro de conexão.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
          placeholder="Buscar por paciente, mãe/pai ou descrição"
          className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
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
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {filter === "PENDING" ? "Nenhuma solicitação pendente." : "Nenhuma solicitação neste filtro."}
        </div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{r.patientName}</span>
                {r.status === "PENDING" &&
                  Date.now() - new Date(r.createdAt).getTime() > DELAYED_AFTER_MS && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      Atrasada
                    </span>
                  )}
              </div>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {TYPE_LABELS[r.type] ?? r.type} · {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{r.summary}</p>
            {r.type === "RESCHEDULE" && r.appointmentAt && (
              <p className="text-xs text-muted-foreground">Sessão atual: {fmtDateTime(r.appointmentAt)}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Criada em {fmtDateTime(r.createdAt)} · {relativeAge(r.createdAt)}
            </p>
            {r.status !== "PENDING" && r.resolvedAt && (
              <p className="text-xs text-muted-foreground">
                {r.status === "RESOLVED" ? "Resolvida" : "Rejeitada"} em {fmtDateTime(r.resolvedAt)}
                {r.resolutionNotes ? ` — ${r.resolutionNotes}` : ""}
              </p>
            )}
            {canWrite && r.status === "PENDING" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {r.type === "UPDATE_DATA" && (
                  <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, "apply")}>
                    Aplicar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={busyId === r.id}
                  onClick={() => act(r.id, "resolve")}
                >
                  Resolver
                </Button>
                <Button
                  size="sm"
                  variant="text"
                  disabled={busyId === r.id}
                  onClick={() => act(r.id, "reject")}
                >
                  Rejeitar
                </Button>
              </div>
            )}
          </div>
        ))
      )}

      {!loading && total > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={changePage} />
      )}
    </div>
  )
}
