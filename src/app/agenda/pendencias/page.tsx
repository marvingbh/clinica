"use client"

import { useCallback, useMemo, useRef, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { useMountEffect, useRequireAuth, usePermission } from "@/shared/hooks"
import { Pagination } from "@/shared/components/ui/pagination"
import { AppointmentStatus } from "@prisma/client"
import { PendenciasStatCards } from "./components/PendenciasStatCards"
import { PendenciasFiltersBar } from "./components/PendenciasFiltersBar"
import { PendenciasTable } from "./components/PendenciasTable"
import { PendenciasBulkBar } from "./components/PendenciasBulkBar"
import { loadProfessionals } from "@/lib/professionals/list"
import { todayIso, addDays } from "@/lib/todos"
import type {
  PendingAppointment,
  ProfessionalLite,
  SortKey,
  SortState,
  StatusFilter,
} from "./types"

const PAGE_SIZE = 50
const DEFAULT_WINDOW_DAYS = 90

function statusFilterToParam(s: StatusFilter): string | null {
  switch (s) {
    case "agendado":
      return "AGENDADO"
    case "confirmado":
      return "CONFIRMADO"
    case "todas":
      return "AGENDADO,CONFIRMADO,FINALIZADO,CANCELADO_FALTA,CANCELADO_ACORDADO,CANCELADO_PROFISSIONAL"
    case "pendentes":
    default:
      return null
  }
}

export default function PendenciasPage() {
  const { isReady } = useRequireAuth()
  const { data: session } = useSession()
  const { canRead: canSeeOthers } = usePermission("agenda_others")
  const isAdmin = canSeeOthers
  const myProfId = session?.user?.professionalProfileId ?? ""

  const [rows, setRows] = useState<PendingAppointment[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalLite[]>([])
  const [loaded, setLoaded] = useState(false)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendentes")
  const [profFilter, setProfFilter] = useState("all")
  const [fromIso, setFromIso] = useState(addDays(todayIso(), -DEFAULT_WINDOW_DAYS))
  const [toIso, setToIso] = useState(todayIso())

  const [sort, setSort] = useState<SortState>({ key: "date", dir: "asc" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [page, setPage] = useState(0)

  const reqIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const reload = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const reqId = ++reqIdRef.current

    const params = new URLSearchParams()
    params.set("from", fromIso)
    params.set("to", toIso)
    if (search.trim()) params.set("q", search.trim())
    const statusParam = statusFilterToParam(statusFilter)
    if (statusParam) params.set("status", statusParam)
    if (isAdmin && profFilter !== "all") params.set("professionalProfileId", profFilter)

    try {
      const res = await fetch(`/api/appointments/pendencias?${params}`, { signal: controller.signal })
      if (!res.ok) {
        toast.error("Erro ao carregar pendências")
        if (mountedRef.current) setLoaded(true)
        return
      }
      const data = await res.json()
      if (reqId !== reqIdRef.current || !mountedRef.current) return
      setRows(data.appointments ?? [])
      setLoaded(true)
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      toast.error("Erro ao carregar pendências")
      if (mountedRef.current) setLoaded(true)
    }
  }, [fromIso, toIso, search, statusFilter, profFilter, isAdmin])

  useMountEffect(() => {
    if (!isReady) return
    if (isAdmin) {
      loadProfessionals().then((list) => {
        if (mountedRef.current) setProfessionals(list)
      })
    } else if (myProfId) {
      setProfessionals([{ id: myProfId, name: session?.user?.name ?? "Eu" }])
    }
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  })

  // Refetch whenever filter args change. The hook closes over them through
  // `reload`'s dependency list, so a single `[reload]` dep covers all of them.
  useEffect(() => {
    if (!isReady) return
    reload()
    setPage(0)
  }, [reload, isReady])

  const filtered = useMemo(() => {
    const out = rows.slice()
    out.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1
      switch (sort.key) {
        case "date":
          return a.scheduledAt.localeCompare(b.scheduledAt) * dir
        case "patient":
          return (
            (a.patient?.name ?? a.title ?? "").localeCompare(b.patient?.name ?? b.title ?? "") * dir
          )
        case "professional":
          return (
            a.professionalProfile.user.name.localeCompare(b.professionalProfile.user.name) * dir
          )
        case "status":
          return a.status.localeCompare(b.status) * dir
      }
    })
    return out
  }, [rows, sort])

  const stats = useMemo(() => {
    const now = Date.now()
    let olderThan7d = 0
    let olderThan30d = 0
    for (const r of rows) {
      if (r.status !== AppointmentStatus.AGENDADO && r.status !== AppointmentStatus.CONFIRMADO) {
        continue
      }
      const days = Math.floor((now - new Date(r.scheduledAt).getTime()) / 86400_000)
      if (days >= 30) olderThan30d++
      else if (days >= 7) olderThan7d++
    }
    const pendingCount = rows.filter(
      (r) =>
        r.status === AppointmentStatus.AGENDADO || r.status === AppointmentStatus.CONFIRMADO
    ).length
    return { total: pendingCount, olderThan7d, olderThan30d }
  }, [rows])

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))
  }

  async function applySingleStatus(a: PendingAppointment, status: AppointmentStatus) {
    setBusyIds((s) => new Set(s).add(a.id))
    try {
      const res = await fetch(`/api/appointments/${a.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "Erro ao atualizar status")
        return
      }
      toast.success(`Atualizado: ${a.patient?.name ?? a.title ?? "agendamento"}`)
      // optimistic: remove from list when filter is "pendentes" (default), otherwise refresh
      if (statusFilter === "pendentes") {
        setRows((prev) => prev.filter((r) => r.id !== a.id))
      } else {
        await reload()
      }
      setSelected((s) => {
        const n = new Set(s)
        n.delete(a.id)
        return n
      })
    } finally {
      setBusyIds((s) => {
        const n = new Set(s)
        n.delete(a.id)
        return n
      })
    }
  }

  async function applyBulkStatus(status: AppointmentStatus) {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const controller = new AbortController()
    setBulkBusy(true)
    setBusyIds((s) => {
      const n = new Set(s)
      for (const id of ids) n.add(id)
      return n
    })
    try {
      // allSettled so a single failure doesn't abort the in-flight peers.
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/appointments/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
            signal: controller.signal,
          }).then((res) => ({ id, ok: res.ok }))
        )
      )
      if (!mountedRef.current) return
      const ok = results.filter((r) => r.status === "fulfilled" && r.value.ok).length
      const fail = ids.length - ok
      if (fail === 0) toast.success(`${ok} atualizada${ok === 1 ? "" : "s"}`)
      else if (ok === 0) toast.error(`Falha em todas as ${fail}`)
      else toast.warning(`${ok} atualizadas, ${fail} falharam`)
      setSelected(new Set())
      await reload()
    } finally {
      if (mountedRef.current) {
        setBulkBusy(false)
        // Only clear ids that were part of THIS batch — preserves any
        // single-row busy state set in parallel.
        setBusyIds((s) => {
          const n = new Set(s)
          for (const id of ids) n.delete(id)
          return n
        })
      }
    }
  }

  if (!isReady || !loaded) {
    return <div className="p-6 text-ink-500 text-[13px]">Carregando pendências...</div>
  }

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const hasPagination = totalCount > PAGE_SIZE
  const hasBulk = selected.size > 0
  const tableRounded = hasBulk
    ? hasPagination
      ? "middle"
      : "bottom"
    : hasPagination
      ? "top"
      : "full"

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 text-[13px] leading-[1.4]">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[12px] text-ink-500">Agenda</div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] leading-tight mt-0.5">
            Pendências
          </h1>
          <div className="text-[12px] text-ink-500 mt-1">
            Agendamentos passados ainda em aberto. Marque como concluídos, faltas ou cancelados.
          </div>
        </div>
      </header>

      <PendenciasStatCards stats={stats} />

      <PendenciasFiltersBar
        search={search}
        onSearch={setSearch}
        status={statusFilter}
        onStatus={setStatusFilter}
        professional={profFilter}
        onProfessional={setProfFilter}
        professionals={professionals}
        canFilterByProfessional={isAdmin}
        fromIso={fromIso}
        toIso={toIso}
        onFrom={setFromIso}
        onTo={setToIso}
      />

      <div>
        <PendenciasBulkBar
          count={selected.size}
          busy={bulkBusy}
          onFinalize={() => applyBulkStatus(AppointmentStatus.FINALIZADO)}
          onMarkNoShow={() => applyBulkStatus(AppointmentStatus.CANCELADO_FALTA)}
          onCancel={() => applyBulkStatus(AppointmentStatus.CANCELADO_PROFISSIONAL)}
          onClear={() => setSelected(new Set())}
        />
        <PendenciasTable
          rows={paged}
          selected={selected}
          busyIds={busyIds}
          onToggleSelect={toggleSel}
          onSelectAllVisible={() => {
            if (paged.every((r) => selected.has(r.id))) {
              setSelected((s) => {
                const n = new Set(s)
                for (const r of paged) n.delete(r.id)
                return n
              })
            } else {
              setSelected((s) => {
                const n = new Set(s)
                for (const r of paged) n.add(r.id)
                return n
              })
            }
          }}
          onFinalize={(a) => applySingleStatus(a, AppointmentStatus.FINALIZADO)}
          onMarkNoShow={(a) => applySingleStatus(a, AppointmentStatus.CANCELADO_FALTA)}
          onCancel={(a) => {
            if (confirm(`Cancelar "${a.patient?.name ?? a.title ?? "agendamento"}"?`))
              applySingleStatus(a, AppointmentStatus.CANCELADO_PROFISSIONAL)
          }}
          sort={sort}
          onSort={toggleSort}
          rounded={tableRounded}
        />
        <Pagination
          page={safePage}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPage={setPage}
        />
      </div>
    </div>
  )
}
