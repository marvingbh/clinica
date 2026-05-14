"use client"

import { useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { usePermission } from "@/shared/hooks"
import { InfoIcon } from "@/shared/components/ui/icons"
import { useAgendaContext } from "../context/AgendaContext"
import { useRecurrenceData } from "./hooks/useRecurrenceData"
import { RecurrenceHeader } from "./components/RecurrenceHeader"
import { RecurrenceGrid } from "./components/RecurrenceGrid"
import { createProfessionalColorMap } from "../lib/professional-colors"
import {
  classifyRecurrenceKind,
  computeWeeklyFreeSlots,
  type RecurrenceKind,
} from "@/lib/appointments/recurrence-slots"

type TypeFilter = "all" | RecurrenceKind

export default function RecurrenceSlotPage() {
  const { status } = useSession()
  const { selectedProfessionalId, setSelectedProfessionalId } = useAgendaContext()
  const { canRead: canReadOthers } = usePermission("agenda_others")
  const isAdmin = canReadOthers

  const { recurrences, professionals, availabilityRules, appointmentDuration, isLoading, error } =
    useRecurrenceData(selectedProfessionalId, isAdmin)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")

  const showProfessionalColors = isAdmin && !selectedProfessionalId
  const isSinglePro = !!selectedProfessionalId

  const professionalColorMap = useMemo(() => {
    if (!showProfessionalColors) return undefined
    return createProfessionalColorMap(recurrences.map((r) => r.professionalProfileId))
  }, [recurrences, showProfessionalColors])

  // Free weekly slots only make sense for a single professional (mixing
  // schedules in "Todos" would flood the grid). Hidden when the type filter
  // explicitly excludes weekly slots.
  const freeSlots = useMemo(() => {
    if (!isSinglePro) return []
    if (typeFilter !== "all" && typeFilter !== "weekly") return []
    return computeWeeklyFreeSlots(availabilityRules, recurrences, appointmentDuration)
  }, [isSinglePro, typeFilter, availabilityRules, recurrences, appointmentDuration])

  // Per-kind tallies for the summary cards and the type-filter chip counts.
  const counts = useMemo(() => {
    const acc: Record<RecurrenceKind, number> = {
      weekly: 0,
      biweekly: 0,
      monthly: 0,
      block: 0,
      group: 0,
    }
    for (const r of recurrences) acc[classifyRecurrenceKind(r)]++
    return acc
  }, [recurrences])

  const filteredRecurrences = useMemo(() => {
    if (typeFilter === "all") return recurrences
    return recurrences.filter((r) => classifyRecurrenceKind(r) === typeFilter)
  }, [recurrences, typeFilter])

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-[1320px] mx-auto px-4 md:px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-1/3" />
            <div className="h-[600px] bg-muted rounded" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      <RecurrenceHeader
        professionals={professionals}
        selectedProfessionalId={selectedProfessionalId}
        isAdmin={isAdmin}
        onSelectProfessional={setSelectedProfessionalId}
        professionalColorMap={professionalColorMap}
      />

      <div className="max-w-[1320px] mx-auto px-4 md:px-6 pt-4 pb-6 space-y-4">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!isLoading && recurrences.length > 0 && (
          <SummaryCards counts={counts} />
        )}

        {!isLoading && recurrences.length > 0 && (
          <TypeFilter active={typeFilter} counts={counts} onChange={setTypeFilter} />
        )}

        {!isLoading && recurrences.length > 0 && (
          <Legend showFreeSlots={isSinglePro && freeSlots.length > 0} />
        )}

        {isLoading && <div className="h-[400px] rounded-md bg-muted/30 animate-pulse" />}

        {!isLoading && recurrences.length === 0 && (
          <div className="rounded-md border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhuma recorrência ativa{selectedProfessionalId ? " para esse profissional" : ""}.
          </div>
        )}

        {!isLoading && recurrences.length > 0 && (
          <RecurrenceGrid
            recurrences={filteredRecurrences}
            freeSlots={freeSlots}
            professionalColorMap={professionalColorMap}
            showProfessional={showProfessionalColors}
          />
        )}
      </div>
    </main>
  )
}

// ============================================================================
// Summary cards
// ============================================================================

function SummaryCards({
  counts,
}: {
  counts: Record<RecurrenceKind, number>
}) {
  const cards: Array<{
    kind: RecurrenceKind
    label: string
    stripe: string
    dot: string
    sub: string
  }> = [
    {
      kind: "weekly",
      label: "Semanais",
      stripe: "bg-blue-500",
      dot: "bg-blue-500",
      sub: counts.weekly === 0 ? "Nenhum slot" : "Todo semana, sem alternância",
    },
    {
      kind: "biweekly",
      label: "Quinzenais",
      stripe: "bg-amber-500",
      dot: "bg-amber-500",
      sub: counts.biweekly === 0 ? "Nenhum slot" : "Par / ímpar — verifique vagas no grid",
    },
    {
      kind: "monthly",
      label: "Mensais",
      stripe: "bg-purple-500",
      dot: "bg-purple-500",
      sub: counts.monthly === 0 ? "Nenhum slot" : "Uma vez por mês",
    },
    {
      kind: "group",
      label: "Grupos",
      stripe: "bg-teal-500",
      dot: "bg-teal-500",
      sub: counts.group === 0 ? "Nenhum grupo" : "Sessões em grupo",
    },
    {
      kind: "block",
      label: "Bloqueios",
      stripe: "bg-rose-500",
      dot: "bg-rose-500",
      sub: counts.block === 0 ? "Nenhum bloqueio" : "Supervisão, terapia, reunião",
    },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.kind}
          className="relative overflow-hidden rounded-sm bg-card border border-ink-200 px-3.5 py-2.5"
        >
          <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${c.stripe}`} aria-hidden />
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-ink-500">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.dot}`} aria-hidden />
            {c.label}
          </div>
          <div className="mt-1 font-mono text-[22px] font-semibold tracking-[-0.02em] leading-none text-ink-900">
            {counts[c.kind]}
            <span className="ml-1.5 text-[11px] font-medium text-ink-500">slots</span>
          </div>
          <div className="text-[11px] text-ink-500 mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Type filter chips
// ============================================================================

function TypeFilter({
  active,
  counts,
  onChange,
}: {
  active: TypeFilter
  counts: Record<RecurrenceKind, number>
  onChange: (t: TypeFilter) => void
}) {
  const options: Array<{ key: TypeFilter; label: string; dot?: string; count?: number }> = [
    { key: "all", label: "Todos" },
    { key: "weekly", label: "Semanal", dot: "bg-blue-500", count: counts.weekly },
    { key: "biweekly", label: "Quinzenal", dot: "bg-amber-500", count: counts.biweekly },
    { key: "monthly", label: "Mensal", dot: "bg-purple-500", count: counts.monthly },
    { key: "group", label: "Grupo", dot: "bg-teal-500", count: counts.group },
    { key: "block", label: "Bloqueio", dot: "bg-rose-500", count: counts.block },
  ]
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-500 mr-1">
        Tipo
      </span>
      {options.map((opt) => {
        const isActive = active === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`h-[30px] inline-flex items-center gap-1.5 px-3 rounded-full text-[12px] font-medium transition-colors border ${
              isActive
                ? "bg-ink-900 text-white border-ink-900"
                : "bg-card text-ink-700 border-ink-200 hover:border-ink-400"
            }`}
          >
            {opt.dot && (
              <span className={`inline-block w-2 h-2 rounded-full ${opt.dot}`} aria-hidden />
            )}
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={`font-mono text-[10px] px-1.5 py-px rounded-full ${
                  isActive ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600"
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Legend bar
// ============================================================================

function Legend({ showFreeSlots }: { showFreeSlots: boolean }) {
  const items = [
    { swatch: "bg-blue-50 border-l-blue-500", label: "Semanal", note: "toda semana" },
    {
      swatch: "bg-amber-50 border-l-amber-500",
      label: "Quinzenal",
      note: "alterna semana par / ímpar",
    },
    {
      swatch: "bg-purple-50 border-l-purple-500",
      label: "Mensal",
      note: "1ª, 2ª, 3ª ou 4ª do mês",
    },
    {
      swatch: "bg-teal-50 border-l-teal-500",
      label: "Grupo",
      note: "sessões em grupo",
    },
    {
      swatch: "bg-rose-50 border-l-rose-500",
      label: "Bloqueio",
      note: "supervisão, terapia, reunião",
    },
  ]
  return (
    <div className="flex items-center gap-5 flex-wrap rounded-sm border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-[12px] text-ink-600">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-2">
          <span className={`inline-block w-3.5 h-3.5 rounded-sm border-l-[3px] ${it.swatch}`} aria-hidden />
          <span className="font-semibold text-ink-800">{it.label}</span>
          <span className="text-ink-500">· {it.note}</span>
        </span>
      ))}
      {showFreeSlots && (
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-3.5 h-3.5 rounded-sm border border-dashed border-emerald-400 bg-emerald-50"
            aria-hidden
          />
          <span className="font-semibold text-emerald-700">Disponível</span>
          <span className="text-ink-500">· dentro da disponibilidade, sem recorrência</span>
        </span>
      )}
      <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-ink-500">
        <InfoIcon className="w-3 h-3 text-ink-400" />
        Slots em verde tracejado estão disponíveis para novos pacientes.
      </span>
    </div>
  )
}
