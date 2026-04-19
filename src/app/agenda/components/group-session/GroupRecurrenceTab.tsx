"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Dialog } from "../Sheet"
import { DateInput } from "../DateInput"
import { TimeInput } from "../TimeInput"
import {
  RefreshCwIcon,
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  InfoIcon,
} from "@/shared/components/ui/icons"
import type { GroupSession } from "./types"

type RecurrenceType = "WEEKLY" | "BIWEEKLY" | "MONTHLY"

const DAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
const DAY_INITIAL = ["D", "S", "T", "Q", "Q", "S", "S"]
const FULL_DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
}
const FREQ_CADENCE: Record<RecurrenceType, string> = {
  WEEKLY: "a cada 7 dias",
  BIWEEKLY: "a cada 14 dias",
  MONTHLY: "a cada 4 semanas",
}

const LABEL = "block text-[12px] font-medium text-ink-700 mb-1.5"
const INPUT =
  "w-full h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
const READONLY_BOX =
  "w-full h-9 px-3 rounded-[4px] border border-ink-200 bg-ink-50 text-ink-600 text-[13px] flex items-center font-mono tabular-nums"

interface GroupRecurrenceTabProps {
  session: GroupSession
  onSaved: () => void
  onClose: () => void
}

function toDisplayDateFromDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
}

function toIsoDate(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : display
}

function calculateEndTime(start: string, dur: number): string {
  if (!start || !dur) return ""
  const [h, m] = start.split(":").map(Number)
  const totalMin = h * 60 + m + dur
  return `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`
}

function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${MONTH_SHORT[d.getMonth()]} · ${DAY_ABBR[d.getDay()].toLowerCase()}`
}

export function GroupRecurrenceTab({ session, onSaved, onClose }: GroupRecurrenceTabProps) {
  const sessionDate = useMemo(() => new Date(session.scheduledAt), [session.scheduledAt])
  const fallbackDay = sessionDate.getDay()
  const fallbackTime = `${String(sessionDate.getHours()).padStart(2, "0")}:${String(sessionDate.getMinutes()).padStart(2, "0")}`
  const fallbackDuration = Math.round((new Date(session.endAt).getTime() - sessionDate.getTime()) / 60000)

  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    (session.recurrenceType as RecurrenceType) || "WEEKLY"
  )
  const [originalRecurrenceType] = useState<RecurrenceType>(
    (session.recurrenceType as RecurrenceType) || "WEEKLY"
  )
  const [dayOfWeek, setDayOfWeek] = useState(session.dayOfWeek ?? fallbackDay)
  const [originalDayOfWeek] = useState(session.dayOfWeek ?? fallbackDay)
  const [startTime, setStartTime] = useState(session.startTime || fallbackTime)
  const [duration, setDuration] = useState(session.duration || fallbackDuration || 60)
  const [isSaving, setIsSaving] = useState(false)
  const [isScopeDialogOpen, setIsScopeDialogOpen] = useState(false)

  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false)
  const [finalizeDate, setFinalizeDate] = useState("")
  const [isFinalizing, setIsFinalizing] = useState(false)

  const upcoming = useMemo(() => {
    const out: { date: Date; idx: number; isCurrent: boolean }[] = []
    const base = new Date(sessionDate)
    base.setHours(0, 0, 0, 0)
    const intervalDays = recurrenceType === "BIWEEKLY" ? 14 : recurrenceType === "WEEKLY" ? 7 : 0
    const count = 5
    for (let i = 0; i < count; i++) {
      let d: Date
      if (recurrenceType === "MONTHLY") {
        d = new Date(base)
        d.setMonth(d.getMonth() + i)
      } else {
        d = new Date(base.getTime() + i * intervalDays * 24 * 60 * 60 * 1000)
      }
      out.push({ date: d, idx: i + 1, isCurrent: i === 0 })
    }
    return out
  }, [sessionDate, recurrenceType])

  if (!session.groupId) return null

  const endTime = calculateEndTime(startTime, duration)
  const isActive = session.isActive ?? true
  const seriesSummary = `Grupo ${RECURRENCE_LABELS[recurrenceType].toLowerCase()} · toda ${FULL_DAY_NAMES[dayOfWeek]}`

  const handleSaveClick = () => setIsScopeDialogOpen(true)

  const handleSaveThisOnly = async () => {
    setIsScopeDialogOpen(false)
    setIsSaving(true)
    try {
      const currentDay = sessionDate.getDay()
      const dayDiff = dayOfWeek - currentDay
      const newDate = new Date(sessionDate)
      newDate.setDate(newDate.getDate() + dayDiff)
      const [h, m] = startTime.split(":").map(Number)
      newDate.setHours(h, m, 0, 0)
      const newEnd = new Date(newDate.getTime() + duration * 60000)

      const res = await fetch("/api/group-sessions/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: session.groupId,
          scheduledAt: session.scheduledAt,
          newScheduledAt: newDate.toISOString(),
          newEndAt: newEnd.toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success("Esta sessão foi atualizada")
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAllFuture = async () => {
    setIsScopeDialogOpen(false)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/groups/${session.groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recurrenceType, dayOfWeek, startTime, duration, applyTo: "future" }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error || "Erro ao atualizar")
        return
      }
      toast.success(result.message || "Recorrência atualizada")
      onSaved()
      onClose()
    } catch {
      toast.error("Erro ao atualizar recorrência")
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!finalizeDate) return
    const isoDate = toIsoDate(finalizeDate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      toast.error("Data inválida")
      return
    }
    setIsFinalizing(true)
    try {
      const res = await fetch(`/api/groups/${session.groupId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: isoDate }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      const data = await res.json()
      toast.success(`Recorrência finalizada. ${data.deletedCount} sessão(ões) removida(s).`)
      setIsFinalizeOpen(false)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar")
    } finally {
      setIsFinalizing(false)
    }
  }

  return (
    <div className="px-4 md:px-6 py-4 space-y-4">
      {/* Series progress strip */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5 p-3 rounded-[4px] border border-brand-100 bg-brand-50">
        <div className="w-9 h-9 rounded-[4px] bg-card border border-brand-100 text-brand-600 grid place-items-center flex-shrink-0">
          <RefreshCwIcon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-brand-900 tracking-tight truncate">
            {seriesSummary}
          </div>
          <div className="text-[11px] text-brand-700 font-mono mt-0.5">
            {upcoming.length > 1
              ? `Próximas: ${upcoming.slice(1, 3).map((u) => shortDate(u.date)).join(" · ")}`
              : "Sem sessões programadas"}
          </div>
        </div>
        <div className="font-mono text-[16px] font-semibold text-brand-700 tracking-tight whitespace-nowrap">
          {RECURRENCE_LABELS[recurrenceType]}
        </div>
      </div>

      {/* Frequency cards */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
          Frequência
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(RECURRENCE_LABELS) as RecurrenceType[]).map((type) => {
            const active = recurrenceType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setRecurrenceType(type)}
                className={`text-left p-3 rounded-[4px] border transition-all ${
                  active
                    ? "border-brand-500 bg-brand-50 shadow-[0_0_0_1px_var(--brand-500)]"
                    : "border-ink-200 bg-card hover:border-ink-400"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={`text-[13px] font-semibold ${
                      active ? "text-brand-800" : "text-ink-900"
                    }`}
                  >
                    {RECURRENCE_LABELS[type]}
                  </span>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border grid place-items-center flex-shrink-0 ${
                      active ? "border-brand-500 bg-brand-500" : "border-ink-300 bg-card"
                    }`}
                  >
                    {active && <span className="w-1 h-1 rounded-full bg-card" />}
                  </span>
                </div>
                <span className="block mt-1 text-[11px] text-ink-500 font-mono">
                  {FREQ_CADENCE[type]}
                </span>
              </button>
            )
          })}
        </div>
        {recurrenceType !== originalRecurrenceType && (
          <div className="mt-2 flex items-start gap-2 p-2.5 rounded-[4px] border border-warn-100 bg-warn-50 text-[12px] text-warn-700">
            <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Mudando de <strong>{RECURRENCE_LABELS[originalRecurrenceType]}</strong> para{" "}
              <strong>{RECURRENCE_LABELS[recurrenceType]}</strong>. Sessões futuras que não se
              encaixam serão removidas.
            </span>
          </div>
        )}
      </div>

      {/* Day of week chip row */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
          Dia da semana
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_ABBR.map((label, i) => {
            const active = dayOfWeek === i
            return (
              <button
                key={i}
                type="button"
                onClick={() => setDayOfWeek(i)}
                className={`h-11 rounded-[4px] border grid place-content-center transition-colors ${
                  active
                    ? "bg-brand-500 border-brand-500 text-white"
                    : "bg-card border-ink-200 text-ink-800 hover:border-ink-400"
                }`}
              >
                <span
                  className={`block text-[10px] font-semibold uppercase tracking-wider text-center ${
                    active ? "text-white/75" : "text-ink-500"
                  }`}
                >
                  {label}
                </span>
                <span
                  className={`block text-[13px] font-medium text-center ${
                    active ? "text-white font-semibold" : "text-ink-800"
                  }`}
                >
                  {DAY_INITIAL[i]}
                </span>
              </button>
            )
          })}
        </div>
        {dayOfWeek !== originalDayOfWeek && (
          <div className="mt-2 flex items-start gap-2 p-2.5 rounded-[4px] border border-warn-100 bg-warn-50 text-[12px] text-warn-700">
            <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Movendo de <strong>{FULL_DAY_NAMES[originalDayOfWeek]}</strong> para{" "}
              <strong>{FULL_DAY_NAMES[dayOfWeek]}</strong>. Sessões futuras serão movidas para o
              novo dia.
            </span>
          </div>
        )}
      </div>

      {/* Horário da série */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
          Horário da série
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div>
            <label className={LABEL}>Início</label>
            <TimeInput
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="HH:MM"
              className={INPUT + " font-mono"}
            />
          </div>
          <div>
            <label className={LABEL}>Duração</label>
            <div className="relative">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={15}
                max={480}
                step={5}
                className={INPUT + " font-mono pr-10"}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-500 font-mono pointer-events-none">
                min
              </span>
            </div>
          </div>
          <div>
            <label className={LABEL}>Término</label>
            <div className={READONLY_BOX}>{endTime || "—"}</div>
          </div>
          <div>
            <label className={LABEL}>Início da série</label>
            <div className={READONLY_BOX}>{toDisplayDateFromDate(sessionDate)}</div>
          </div>
        </div>
      </div>

      {/* Upcoming preview */}
      {upcoming.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
            Próximas sessões
          </div>
          <div className="rounded-[4px] border border-ink-200 bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-ink-100 text-[12px] text-ink-700 font-medium">
              <span>Cronograma do grupo</span>
              <span className="text-[11px] text-ink-500 font-mono">{upcoming.length} sessões</span>
            </div>
            <ul className="max-h-[180px] overflow-y-auto">
              {upcoming.map((u) => {
                const isNext = u.isCurrent
                return (
                  <li
                    key={u.idx}
                    className="grid grid-cols-[20px_1fr_auto_auto] gap-3 items-center px-3 py-1.5 border-b border-dashed border-ink-100 last:border-b-0 text-[12px]"
                  >
                    <span
                      className={`w-5 h-5 rounded-full font-mono text-[10px] grid place-items-center ${
                        isNext ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {u.idx}
                    </span>
                    <span className="font-mono text-[11px] text-ink-800 truncate">
                      {shortDate(u.date)}
                    </span>
                    <span className="font-mono text-[11px] text-ink-600 whitespace-nowrap">
                      {startTime || "—"}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                        isNext
                          ? "bg-brand-50 text-brand-700 border-brand-100"
                          : "bg-ink-50 text-ink-600 border-ink-200"
                      }`}
                    >
                      {isNext ? "Esta" : "Agendada"}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Danger zone — finalize the group recurrence */}
      {isActive && (
        <details className="rounded-[4px] border border-ink-200 bg-card open:border-err-100 open:bg-err-50 group">
          <summary className="list-none cursor-pointer px-3 py-2.5 text-[13px] font-medium text-ink-700 group-open:text-err-700 flex items-center gap-2">
            <AlertTriangleIcon className="w-3.5 h-3.5 text-err-500" />
            Encerrar grupo
            <ChevronRightIcon className="w-3.5 h-3.5 text-ink-400 ml-auto transition-transform group-open:rotate-90 group-open:text-err-500" />
          </summary>
          <div className="px-3 pb-3">
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center p-2.5 rounded-[4px] border border-ink-200 bg-card text-[12px]">
              <div>
                <div className="font-medium text-ink-800">Encerrar a partir de uma data</div>
                <div className="text-[11px] text-ink-500 mt-0.5 font-mono">
                  Mantém sessões passadas · remove as futuras · desativa o grupo
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFinalizeDate(toDisplayDateFromDate(new Date()))
                  setIsFinalizeOpen(true)
                }}
                className="h-8 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[12px] font-medium hover:bg-ink-50 hover:border-ink-400 transition-colors"
              >
                Encerrar
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Footer — matches design m-foot: ink-50 strip, hint left, actions right */}
      <div className="-mx-4 md:-mx-6 -mb-4 mt-2 flex items-center justify-between gap-3 flex-wrap px-4 md:px-6 py-3.5 bg-ink-50 border-t border-ink-200">
        <div className="flex items-center gap-2 text-[12px] text-ink-500">
          <InfoIcon className="w-3.5 h-3.5" />
          <span>
            Escolha em seguida se aplica{" "}
            <strong className="text-ink-700 font-medium">apenas a esta sessão</strong> ou à série
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving}
            className="h-10 px-4 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
          >
            <CheckIcon className="w-4 h-4" />
            {isSaving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      {/* Scope Dialog */}
      <Dialog
        isOpen={isScopeDialogOpen}
        onClose={() => setIsScopeDialogOpen(false)}
        title="Aplicar alterações"
      >
        <p className="text-[13px] text-ink-600 mb-4">
          Deseja alterar apenas esta sessão ou todas as sessões futuras do grupo?
        </p>
        <div className="space-y-2 mb-4">
          <button
            type="button"
            onClick={handleSaveThisOnly}
            disabled={isSaving}
            className="w-full text-left p-3 rounded-[4px] border border-ink-200 bg-card hover:bg-ink-50 transition-colors disabled:opacity-50"
          >
            <span className="block text-[13px] font-semibold text-ink-800">
              Apenas esta sessão
            </span>
            <span className="block text-[11px] text-ink-500 mt-0.5">
              Altera horário/dia somente nesta data
            </span>
          </button>
          <button
            type="button"
            onClick={handleSaveAllFuture}
            disabled={isSaving}
            className="w-full text-left p-3 rounded-[4px] border border-brand-400 bg-brand-50 hover:bg-brand-100 transition-colors disabled:opacity-50"
          >
            <span className="block text-[13px] font-semibold text-brand-800">
              Esta e todas as futuras
            </span>
            <span className="block text-[11px] text-brand-700 mt-0.5">
              Atualiza a recorrência e move sessões futuras
            </span>
          </button>
        </div>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setIsScopeDialogOpen(false)}
            className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </Dialog>

      {/* Finalize Dialog */}
      <Dialog
        isOpen={isFinalizeOpen}
        onClose={() => setIsFinalizeOpen(false)}
        title="Encerrar grupo"
      >
        <p className="text-[13px] text-ink-600 mb-4">
          Sessões após essa data serão removidas e o grupo será desativado.
        </p>
        <div className="mb-5">
          <label htmlFor="groupFinalizeDate" className={LABEL}>
            Data final
          </label>
          <DateInput
            id="groupFinalizeDate"
            value={finalizeDate}
            onChange={(e) => setFinalizeDate(e.target.value)}
            className={INPUT + " font-mono h-10"}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsFinalizeOpen(false)}
            disabled={isFinalizing}
            className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={isFinalizing || !finalizeDate}
            className="h-10 px-4 rounded-[4px] bg-warn-500 text-white font-medium text-[13px] hover:bg-warn-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
          >
            <ClockIcon className="w-4 h-4" />
            {isFinalizing ? "Encerrando..." : "Encerrar grupo"}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
