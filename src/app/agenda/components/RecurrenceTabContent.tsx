"use client"

import { useMemo, useState } from "react"
import { Appointment, RecurrenceType, RecurrenceEndType, Modality, Professional } from "../lib/types"
import { RECURRENCE_TYPE_LABELS, MAX_RECURRENCE_OCCURRENCES } from "../lib/constants"
import { TimeInput } from "./TimeInput"
import { DateInput } from "./DateInput"
import { toDisplayDateFromDate, toIsoDate, calculateEndTime, addMonthsToDate } from "../lib/utils"
import { toast } from "sonner"
import { Dialog } from "./Sheet"
import {
  RefreshCwIcon,
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  TrashIcon,
  BuildingIcon,
  VideoIcon,
  ClockIcon,
  InfoIcon,
} from "@/shared/components/ui/icons"
import { Segmented, type SegmentedOption } from "@/shared/components/ui/segmented"

interface RecurrenceTabContentProps {
  appointment: Appointment
  onSave: () => void
  onClose: () => void
  professionals?: Professional[]
}

const DAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
const DAY_INITIAL = ["D", "S", "T", "Q", "Q", "S", "S"]
const FULL_DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

const FREQ_CADENCE: Record<RecurrenceType, string> = {
  WEEKLY: "a cada 7 dias",
  BIWEEKLY: "a cada 14 dias",
  MONTHLY: "a cada 4 semanas",
}

const LABEL = "block text-[12px] font-medium text-ink-700 mb-1.5"
const INPUT =
  "w-full h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] disabled:bg-ink-100 disabled:text-ink-500"
const READONLY_BOX =
  "w-full h-9 px-3 rounded-[4px] border border-ink-200 bg-ink-50 text-ink-600 text-[13px] flex items-center font-mono tabular-nums"
const MODALITY_OPTIONS: SegmentedOption<Modality>[] = [
  { value: "PRESENCIAL", label: "Presencial", icon: <BuildingIcon className="w-3 h-3" /> },
  { value: "ONLINE", label: "Online", icon: <VideoIcon className="w-3 h-3" /> },
]

function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${MONTH_SHORT[d.getMonth()]} · ${DAY_ABBR[d.getDay()].toLowerCase()}`
}

export function RecurrenceTabContent({ appointment, onSave, onClose, professionals }: RecurrenceTabContentProps) {
  const recurrence = appointment?.recurrence

  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(recurrence?.recurrenceType ?? "WEEKLY")
  const [originalRecurrenceType] = useState<RecurrenceType>(recurrence?.recurrenceType ?? "WEEKLY")
  const [startTime, setStartTime] = useState(recurrence?.startTime ?? "")
  const [duration, setDuration] = useState(recurrence?.duration ?? 50)
  const [modality, setModality] = useState<Modality>((appointment?.modality as Modality) ?? "PRESENCIAL")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>(
    recurrence?.recurrenceEndType ?? "BY_OCCURRENCES"
  )
  const [endDate, setEndDate] = useState(
    recurrence?.endDate ? toDisplayDateFromDate(new Date(recurrence.endDate)) : ""
  )
  const [occurrences, setOccurrences] = useState(recurrence?.occurrences || 10)
  const [dayOfWeek, setDayOfWeek] = useState<number>(recurrence?.dayOfWeek ?? 0)
  const [originalDayOfWeek] = useState<number>(recurrence?.dayOfWeek ?? 0)
  const [applyToFuture, setApplyToFuture] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [additionalProfIds, setAdditionalProfIds] = useState<string[]>(
    appointment?.additionalProfessionals?.map((ap) => ap.professionalProfile.id) || []
  )

  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false)
  const [finalizeDate, setFinalizeDate] = useState("")
  const [isFinalizing, setIsFinalizing] = useState(false)

  const [isSwapDialogOpen, setIsSwapDialogOpen] = useState(false)
  const [swapScope, setSwapScope] = useState<"future" | "all">("future")
  const [isSwapping, setIsSwapping] = useState(false)

  const appointmentDate = useMemo(() => new Date(appointment.scheduledAt), [appointment.scheduledAt])

  // Series stats: generate next N dates from appointment's scheduledAt forward
  // to give a visual preview. Past dates aren't in this prediction — those
  // come from the server in a future iteration.
  const upcoming = useMemo(() => {
    if (!recurrence) return []
    const out: { date: Date; idx: number; isCurrent: boolean }[] = []
    const base = new Date(appointmentDate)
    base.setHours(0, 0, 0, 0)
    const intervalDays = recurrenceType === "BIWEEKLY" ? 14 : recurrenceType === "WEEKLY" ? 7 : 0
    let maxCount = 5
    if (recurrenceEndType === "BY_OCCURRENCES") maxCount = Math.min(5, occurrences)
    for (let i = 0; i < maxCount; i++) {
      let d: Date
      if (recurrenceType === "MONTHLY") d = addMonthsToDate(base, i)
      else d = new Date(base.getTime() + i * intervalDays * 24 * 60 * 60 * 1000)
      if (recurrenceEndType === "BY_DATE" && endDate) {
        const endObj = (() => {
          const m = endDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
          if (!m) return null
          return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
        })()
        if (endObj && d > endObj) break
      }
      out.push({ date: d, idx: i + 1, isCurrent: i === 0 })
    }
    return out
  }, [recurrence, recurrenceType, recurrenceEndType, occurrences, endDate, appointmentDate])

  async function handleSave() {
    if (!appointment?.recurrence) return

    setIsSaving(true)
    try {
      const computedEndTime = calculateEndTime(startTime, duration)
      const body: Record<string, unknown> = {
        recurrenceType,
        startTime,
        endTime: computedEndTime || startTime,
        modality,
        recurrenceEndType,
      }
      if (recurrenceEndType === "BY_DATE") body.endDate = endDate ? toIsoDate(endDate) : null
      else if (recurrenceEndType === "BY_OCCURRENCES") body.occurrences = occurrences
      if (dayOfWeek !== originalDayOfWeek) body.dayOfWeek = dayOfWeek
      body.additionalProfessionalIds = additionalProfIds
      if (applyToFuture) body.applyTo = "future"

      const response = await fetch(`/api/appointments/recurrences/${appointment.recurrence.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await response.json()

      if (!response.ok) {
        if (result.conflicts && Array.isArray(result.conflicts)) {
          const conflictDates = result.conflicts
            .map((c: { date: string; conflictsWith: string }) => `${c.date} (conflito com ${c.conflictsWith})`)
            .join(", ")
          toast.error(`Conflitos encontrados: ${conflictDates}`)
        } else {
          toast.error(result.error || "Erro ao atualizar recorrência")
        }
        return
      }
      toast.success(result.message || "Recorrência atualizada com sucesso")
      onSave()
      onClose()
    } catch {
      toast.error("Erro ao atualizar recorrência")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleFinalize() {
    if (!appointment?.recurrence || !finalizeDate) return
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(finalizeDate)) {
      toast.error("Data inválida (DD/MM/AAAA)")
      return
    }
    setIsFinalizing(true)
    try {
      const response = await fetch(`/api/appointments/recurrences/${appointment.recurrence.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: toIsoDate(finalizeDate) }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || "Erro ao finalizar recorrência")
        return
      }
      toast.success(result.message || "Recorrência finalizada com sucesso")
      setIsFinalizeDialogOpen(false)
      onSave()
      onClose()
    } catch {
      toast.error("Erro ao finalizar recorrência")
    } finally {
      setIsFinalizing(false)
    }
  }

  async function handleSwapBiweeklyWeek() {
    if (!appointment?.recurrence) return
    setIsSwapping(true)
    try {
      const response = await fetch(`/api/appointments/recurrences/${appointment.recurrence.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swapBiweeklyWeek: true, swapScope }),
      })
      const result = await response.json()
      if (!response.ok) {
        if (result.code === "BIWEEKLY_SWAP_CONFLICTS" && result.conflicts) {
          const conflictDates = result.conflicts
            .map((c: { date: string; conflictsWith: string }) => `${c.date} (conflito com ${c.conflictsWith})`)
            .join(", ")
          toast.error(`Conflitos encontrados: ${conflictDates}`)
        } else {
          toast.error(result.error || "Erro ao trocar semana quinzenal")
        }
        return
      }
      toast.success(result.message || "Semana quinzenal trocada com sucesso")
      setIsSwapDialogOpen(false)
      onSave()
      onClose()
    } catch {
      toast.error("Erro ao trocar semana quinzenal")
    } finally {
      setIsSwapping(false)
    }
  }

  if (!appointment?.recurrence) return null

  const seriesSummary = `Série ${RECURRENCE_TYPE_LABELS[recurrenceType].toLowerCase()} · toda ${FULL_DAY_NAMES[dayOfWeek]}`
  const additionalCandidates = (professionals || []).filter(
    (p) => p.professionalProfile?.id && p.professionalProfile.id !== appointment.professionalProfile.id
  )

  return (
    <>
      <div className="space-y-4">
        {/* ══════════════════ Series progress strip ══════════════════ */}
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
            {RECURRENCE_TYPE_LABELS[recurrenceType]}
          </div>
        </div>

        {/* ══════════════════ Frequency cards ══════════════════ */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
            Frequência
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(RECURRENCE_TYPE_LABELS) as RecurrenceType[]).map((type) => {
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
                      {RECURRENCE_TYPE_LABELS[type]}
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
                Mudando de <strong>{RECURRENCE_TYPE_LABELS[originalRecurrenceType]}</strong> para{" "}
                <strong>{RECURRENCE_TYPE_LABELS[recurrenceType]}</strong>. Agendamentos que não se
                encaixam serão removidos.
              </span>
            </div>
          )}
        </div>

        {/* ══════════════════ Day of week chip row ══════════════════ */}
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
                <strong>{FULL_DAY_NAMES[dayOfWeek]}</strong>. Agendamentos futuros serão movidos
                para o novo dia.
              </span>
            </div>
          )}
        </div>

        {/* ══════════════════ Horário da série ══════════════════ */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
            Horário da série
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label htmlFor="recStartTime" className={LABEL}>
                Início
              </label>
              <TimeInput
                id="recStartTime"
                placeholder="HH:MM"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={INPUT + " font-mono"}
              />
            </div>
            <div>
              <label htmlFor="recDuration" className={LABEL}>
                Duração
              </label>
              <div className="relative">
                <input
                  id="recDuration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(5, parseInt(e.target.value) || 5))}
                  min={5}
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
              <div className={READONLY_BOX}>
                {calculateEndTime(startTime, duration) || "—"}
              </div>
            </div>
            <div>
              <label className={LABEL}>Início da série</label>
              <div className={READONLY_BOX}>
                {toDisplayDateFromDate(appointmentDate)}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════ Shift suggestion (biweekly only) ══════════════════ */}
        {recurrenceType === "BIWEEKLY" && (
          <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center p-3 rounded-[4px] border border-dashed border-brand-300 bg-brand-50">
            <div className="w-7 h-7 rounded-[4px] bg-card border border-brand-100 text-brand-600 grid place-items-center flex-shrink-0">
              <RefreshCwIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-brand-900">
                Mover série para a semana alternada
              </div>
              <div className="text-[11px] text-brand-700 font-mono mt-0.5">
                +7 dias em todas as sessões futuras
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsSwapDialogOpen(true)}
              className="h-8 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[12px] font-medium hover:bg-ink-50 hover:border-ink-400 transition-colors whitespace-nowrap"
            >
              Deslocar +7d
            </button>
          </div>
        )}

        {/* ══════════════════ Modalidade ══════════════════ */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
            Modalidade
          </div>
          <Segmented<Modality>
            options={MODALITY_OPTIONS}
            value={modality}
            onChange={setModality}
            size="sm"
            ariaLabel="Modalidade"
          />
        </div>

        {/* ══════════════════ Equipe adicional ══════════════════ */}
        {additionalCandidates.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
              Profissionais adicionais
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {additionalCandidates.map((prof) => {
                const profId = prof.professionalProfile!.id
                const checked = additionalProfIds.includes(profId)
                return (
                  <label
                    key={prof.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-[4px] border cursor-pointer transition-colors text-[13px] ${
                      checked
                        ? "border-brand-400 bg-brand-50"
                        : "border-ink-200 bg-card hover:border-ink-400 hover:bg-ink-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setAdditionalProfIds([...additionalProfIds, profId])
                        else setAdditionalProfIds(additionalProfIds.filter((x) => x !== profId))
                      }}
                      className="w-4 h-4 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
                    />
                    <span className="font-medium text-ink-800 truncate">{prof.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* ══════════════════ End condition card ══════════════════ */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
            Condição de término
          </div>
          <div className="rounded-[4px] border border-ink-200 bg-card overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-ink-100">
              {(
                [
                  { key: "INDEFINITE", label: "Sem fim", sub: "repete indefinidamente" },
                  { key: "BY_DATE", label: "Em uma data", sub: endDate || "escolha a data" },
                  { key: "BY_OCCURRENCES", label: "Após N sessões", sub: `${occurrences} no total` },
                ] as const
              ).map((opt, i) => {
                const active = recurrenceEndType === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setRecurrenceEndType(opt.key as RecurrenceEndType)}
                    className={`text-left px-3 py-2.5 transition-colors ${
                      i > 0 ? "border-t sm:border-t-0 sm:border-l border-ink-100" : ""
                    } ${active ? "bg-card" : "hover:bg-ink-50"}`}
                  >
                    <span
                      className={`flex items-center gap-1.5 text-[12px] font-medium ${
                        active ? "text-brand-800" : "text-ink-800"
                      }`}
                    >
                      <span
                        className={`w-3 h-3 rounded-full border grid place-items-center flex-shrink-0 ${
                          active ? "border-brand-500 bg-brand-500" : "border-ink-300 bg-card"
                        }`}
                      >
                        {active && <span className="w-1 h-1 rounded-full bg-card" />}
                      </span>
                      <span className={active ? "font-semibold" : ""}>{opt.label}</span>
                    </span>
                    <span className="block mt-0.5 pl-[18px] text-[11px] text-ink-500 font-mono">
                      {opt.sub}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="px-3 py-2.5">
              {recurrenceEndType === "INDEFINITE" && (
                <p className="text-[12px] text-ink-600">
                  Agendamentos são criados automaticamente e estendidos semanalmente.
                </p>
              )}
              {recurrenceEndType === "BY_DATE" && (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[12px] text-ink-600">Terminar em</span>
                  <DateInput
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-40 h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] font-mono focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
                  />
                </div>
              )}
              {recurrenceEndType === "BY_OCCURRENCES" && (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[12px] text-ink-600">Total de sessões</span>
                  <input
                    type="number"
                    value={occurrences}
                    onChange={(e) =>
                      setOccurrences(Math.min(MAX_RECURRENCE_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)))
                    }
                    min={1}
                    max={MAX_RECURRENCE_OCCURRENCES}
                    className="w-24 h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] font-mono focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
                  />
                  <span className="text-[11px] text-ink-500 font-mono">
                    máx. {MAX_RECURRENCE_OCCURRENCES}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════ Upcoming sessions preview ══════════════════ */}
        {upcoming.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
              Próximas sessões
            </div>
            <div className="rounded-[4px] border border-ink-200 bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-ink-100 text-[12px] text-ink-700 font-medium">
                <span>Cronograma</span>
                <span className="text-[11px] text-ink-500 font-mono">
                  {upcoming.length} sessões
                </span>
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
                        {isNext ? "Próxima" : "Agendada"}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}

        {/* ══════════════════ Apply to future ══════════════════ */}
        <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-[4px] border border-ink-200 bg-card">
          <input
            type="checkbox"
            checked={applyToFuture}
            onChange={(e) => setApplyToFuture(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
          />
          <span>
            <span className="block text-[13px] text-ink-800 font-medium">
              Aplicar às sessões futuras
            </span>
            <span className="block text-[11px] text-ink-500 mt-0.5">
              Horário e modalidade serão atualizados nos próximos agendamentos. Sessões passadas permanecem iguais.
            </span>
          </span>
        </label>

        {/* ══════════════════ Danger zone (collapsible) ══════════════════ */}
        <details className="rounded-[4px] border border-ink-200 bg-card open:border-err-100 open:bg-err-50 group">
          <summary className="list-none cursor-pointer px-3 py-2.5 text-[13px] font-medium text-ink-700 group-open:text-err-700 flex items-center gap-2">
            <AlertTriangleIcon className="w-3.5 h-3.5 text-err-500" />
            Encerrar ou apagar série
            <ChevronRightIcon className="w-3.5 h-3.5 text-ink-400 ml-auto transition-transform group-open:rotate-90 group-open:text-err-500" />
          </summary>
          <div className="px-3 pb-3 grid gap-2">
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center p-2.5 rounded-[4px] border border-ink-200 bg-card text-[12px]">
              <div>
                <div className="font-medium text-ink-800">Encerrar a partir de uma data</div>
                <div className="text-[11px] text-ink-500 mt-0.5 font-mono">
                  Mantém sessões passadas · remove as futuras
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFinalizeDate(toDisplayDateFromDate(new Date()))
                  setIsFinalizeDialogOpen(true)
                }}
                className="h-8 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[12px] font-medium hover:bg-ink-50 hover:border-ink-400 transition-colors"
              >
                Encerrar
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center p-2.5 rounded-[4px] border border-ink-200 bg-card text-[12px]">
              <div>
                <div className="font-medium text-ink-800">Apagar série inteira</div>
                <div className="text-[11px] text-ink-500 mt-0.5 font-mono">
                  Remove todas as sessões · mantém histórico financeiro
                </div>
              </div>
              <button
                type="button"
                disabled
                title="Disponível em breve"
                className="h-8 px-3 rounded-[4px] border border-err-100 bg-card text-err-700 text-[12px] font-medium inline-flex items-center gap-1.5 opacity-50 cursor-not-allowed"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                Apagar série
              </button>
            </div>
          </div>
        </details>

        {/* Footer — matches design m-foot: ink-50 strip, hint left, actions right */}
        <div className="-mx-6 -mb-6 mt-2 flex items-center justify-between gap-3 flex-wrap px-6 py-3.5 bg-ink-50 border-t border-ink-200">
          <div className="flex items-center gap-2 text-[12px] text-ink-500">
            <InfoIcon className="w-3.5 h-3.5" />
            <span>
              Atualiza a{" "}
              <strong className="text-ink-700 font-medium">recorrência inteira</strong> · sessões
              futuras serão ajustadas
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
              onClick={handleSave}
              disabled={isSaving}
              className="h-10 px-4 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              <CheckIcon className="w-4 h-4" />
              {isSaving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>

      {/* Finalize Dialog */}
      <Dialog
        isOpen={isFinalizeDialogOpen}
        onClose={() => setIsFinalizeDialogOpen(false)}
        title="Encerrar recorrência"
      >
        <p className="text-[13px] text-ink-600 mb-4">
          Defina a data final para esta recorrência. Após essa data, não serão gerados novos agendamentos.
        </p>
        <div className="mb-5">
          <label htmlFor="finalizeDate" className={LABEL}>
            Data final
          </label>
          <DateInput
            id="finalizeDate"
            value={finalizeDate}
            onChange={(e) => setFinalizeDate(e.target.value)}
            className={INPUT + " font-mono h-10"}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsFinalizeDialogOpen(false)}
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
            {isFinalizing ? "Encerrando..." : "Encerrar série"}
          </button>
        </div>
      </Dialog>

      {/* Swap Biweekly Dialog */}
      <Dialog
        isOpen={isSwapDialogOpen}
        onClose={() => setIsSwapDialogOpen(false)}
        title="Deslocar semana quinzenal"
      >
        <p className="text-[13px] text-ink-600 mb-4">
          Todos os agendamentos serão movidos 7 dias para frente, trocando a semana ativa da série quinzenal.
        </p>
        <div className="space-y-2 mb-5">
          <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-[4px] border border-ink-200 hover:bg-ink-50 transition-colors">
            <input
              type="radio"
              name="swapScope"
              checked={swapScope === "future"}
              onChange={() => setSwapScope("future")}
              className="w-4 h-4 mt-0.5 text-brand-500 focus:ring-brand-500/25"
            />
            <span>
              <span className="block text-[13px] font-medium text-ink-800">Somente futuros</span>
              <span className="block text-[11px] text-ink-500 mt-0.5">
                Agendamentos passados permanecem inalterados.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-[4px] border border-ink-200 hover:bg-ink-50 transition-colors">
            <input
              type="radio"
              name="swapScope"
              checked={swapScope === "all"}
              onChange={() => setSwapScope("all")}
              className="w-4 h-4 mt-0.5 text-brand-500 focus:ring-brand-500/25"
            />
            <span>
              <span className="block text-[13px] font-medium text-ink-800">Todos os agendamentos</span>
              <span className="block text-[11px] text-ink-500 mt-0.5">
                Inclui sessões passadas para manter o histórico correto.
              </span>
            </span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsSwapDialogOpen(false)}
            disabled={isSwapping}
            className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSwapBiweeklyWeek}
            disabled={isSwapping}
            className="h-10 px-4 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSwapping ? "Deslocando..." : "Deslocar semana"}
          </button>
        </div>
      </Dialog>
    </>
  )
}
