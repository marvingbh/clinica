"use client"

import { useMemo } from "react"
import { UseFormReturn } from "react-hook-form"
import { Sheet } from "./Sheet"
import { InlineAlert } from "./InlineAlert"
import { TimeInput } from "./TimeInput"
import { DateInput } from "./DateInput"
import { ENTRY_TYPE_LABELS, NEW_ENTRY_TITLES } from "../lib/constants"
import { calculateEndTime, addMonthsToDate } from "../lib/utils"
import { PatientSearch } from "./PatientSearch"
import { Badge } from "@/shared/components/ui/badge"
import { Segmented, type SegmentedOption } from "@/shared/components/ui/segmented"
import {
  AlertTriangleIcon,
  XIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  UserIcon,
  RefreshCwIcon,
  CheckIcon,
  InfoIcon,
  ClipboardListIcon,
  BellIcon,
  StickyNoteIcon,
  ListChecksIcon,
  FileTextIcon,
} from "@/shared/components/ui"
import type {
  CalendarEntryFormData,
  CalendarEntryType,
  RecurrenceEndType,
  Professional,
  Patient,
} from "../lib/types"

type EntryType = Exclude<CalendarEntryType, "CONSULTA">

const labelClass = "block text-[12px] font-medium text-ink-700 mb-1.5"
const inputClass =
  "w-full h-11 md:h-10 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] disabled:bg-ink-100 disabled:text-ink-500"
const selectClass =
  inputClass +
  " appearance-none pr-8 bg-no-repeat bg-[right_0.6rem_center] bg-[length:12px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 20 20%22 fill=%22none%22 stroke=%22%2364748B%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 8 10 12 14 8%22/></svg>')]"
const textareaClass =
  "w-full px-3 py-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] resize-none min-h-[84px]"
const errorClass = "text-[12px] text-err-700 mt-1"
const readonlyBoxClass =
  "w-full h-11 md:h-10 px-3 rounded-[4px] border border-ink-200 bg-ink-50 text-ink-700 text-[13px] flex items-center"

const DAY_ABBR = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]
const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

const ENTRY_TYPE_TONE: Record<EntryType, "brand" | "warn" | "ok" | "neutral" | "err"> = {
  TAREFA: "warn",
  LEMBRETE: "brand",
  NOTA: "neutral",
  REUNIAO: "ok",
}

const ENTRY_TYPE_ICONS: Record<EntryType, React.ComponentType<{ className?: string }>> = {
  TAREFA: ListChecksIcon,
  LEMBRETE: BellIcon,
  NOTA: StickyNoteIcon,
  REUNIAO: UsersIcon,
}

// Header bar background per type — so each entry kind reads at a glance.
const ENTRY_HEADER_BG: Record<EntryType, string> = {
  TAREFA: "bg-warn-500",
  LEMBRETE: "bg-sky-500",
  NOTA: "bg-ink-700",
  REUNIAO: "bg-brand-500",
}

const FREQUENCY_OPTIONS: SegmentedOption<"WEEKLY" | "BIWEEKLY">[] = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
]

const END_TYPE_OPTIONS: SegmentedOption<RecurrenceEndType>[] = [
  { value: "BY_OCCURRENCES", label: "Nº de sessões" },
  { value: "BY_DATE", label: "Até uma data" },
  { value: "INDEFINITE", label: "Sem fim" },
]

function parseBrDate(value: string): Date | null {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (Number.isNaN(d.getTime())) return null
  return d
}

interface CalendarEntrySheetProps {
  isOpen: boolean
  onClose: () => void
  entryType: EntryType
  form: UseFormReturn<CalendarEntryFormData>
  isAdmin: boolean
  professionals: Professional[]
  createProfessionalId: string
  setCreateProfessionalId: (id: string) => void
  isProfessionalLocked: boolean
  selectedProfessionalId: string
  isRecurring: boolean
  setIsRecurring: (value: boolean) => void
  recurrenceType: "WEEKLY" | "BIWEEKLY"
  setRecurrenceType: (type: "WEEKLY" | "BIWEEKLY") => void
  recurrenceEndType: RecurrenceEndType
  setRecurrenceEndType: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  setRecurrenceEndDate: (date: string) => void
  recurrenceOccurrences: number
  setRecurrenceOccurrences: (occurrences: number) => void
  additionalProfessionalIds: string[]
  setAdditionalProfessionalIds: (ids: string[]) => void
  selectedPatient?: Patient | null
  onSelectPatient?: (patient: Patient) => void
  onClearPatient?: () => void
  patientSearch?: string
  onPatientSearchChange?: (value: string) => void
  apiError: string | null
  onDismissError: () => void
  availabilityWarning?: string | null
  onConfirmAvailabilityOverride?: () => void
  onDismissAvailabilityWarning?: () => void
  isSaving: boolean
  onSubmit: (data: CalendarEntryFormData) => Promise<void>
}

export function CalendarEntrySheet({
  isOpen,
  onClose,
  entryType,
  form,
  isAdmin,
  professionals,
  createProfessionalId,
  setCreateProfessionalId,
  isProfessionalLocked,
  selectedProfessionalId,
  isRecurring,
  setIsRecurring,
  recurrenceType,
  setRecurrenceType,
  recurrenceEndType,
  setRecurrenceEndType,
  recurrenceEndDate,
  setRecurrenceEndDate,
  recurrenceOccurrences,
  setRecurrenceOccurrences,
  additionalProfessionalIds,
  setAdditionalProfessionalIds,
  selectedPatient,
  onSelectPatient,
  onClearPatient,
  patientSearch,
  onPatientSearchChange,
  apiError,
  onDismissError,
  availabilityWarning,
  onConfirmAvailabilityOverride,
  onDismissAvailabilityWarning,
  isSaving,
  onSubmit,
}: CalendarEntrySheetProps) {
  const typeLabel = ENTRY_TYPE_LABELS[entryType] || entryType
  const TypeIcon = ENTRY_TYPE_ICONS[entryType] || FileTextIcon
  const blocksTime = entryType !== "LEMBRETE" && entryType !== "NOTA"

  const watchedTitle = form.watch("title") || ""
  const watchedDate = form.watch("date") || ""
  const watchedStartTime = form.watch("startTime") || ""
  const watchedDuration = form.watch("duration")
  const computedEndTime = calculateEndTime(watchedStartTime, watchedDuration) || ""

  const effectivePrimaryId = selectedProfessionalId || createProfessionalId
  const additionalProfessionalsAvailable = professionals.filter(
    (p) => p.professionalProfile?.id && p.professionalProfile.id !== effectivePrimaryId
  )

  const preview = useMemo(() => {
    const dateObj = parseBrDate(watchedDate)
    const isDateValid = !!dateObj
    const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(watchedStartTime)

    const whenHeader = isDateValid
      ? `${DAY_ABBR[dateObj!.getDay()]} · ${String(dateObj!.getDate()).padStart(2, "0")} ${MONTH_ABBR[dateObj!.getMonth()]} ${dateObj!.getFullYear()}`
      : "Defina a data"

    let timeRange: string
    if (!blocksTime) {
      timeRange = timeValid ? watchedStartTime : "Defina o horário"
    } else if (timeValid && computedEndTime) {
      timeRange = `${watchedStartTime} → ${computedEndTime}`
    } else if (timeValid) {
      timeRange = watchedStartTime
    } else {
      timeRange = "Defina o horário"
    }

    const primaryProfessional = professionals.find(
      (p) => p.professionalProfile?.id === effectivePrimaryId
    )

    let recurrenceSummary = "Única"
    let sessionCount = 0
    if (isRecurring) {
      const freqLabel = recurrenceType === "BIWEEKLY" ? "Quinzenal" : "Semanal"
      if (recurrenceEndType === "INDEFINITE") {
        recurrenceSummary = `${freqLabel} · sem fim`
      } else if (recurrenceEndType === "BY_OCCURRENCES") {
        recurrenceSummary = `${freqLabel} · ${recurrenceOccurrences} sessões`
      } else {
        recurrenceSummary = recurrenceEndDate
          ? `${freqLabel} · até ${recurrenceEndDate}`
          : `${freqLabel} · até —`
      }

      if (isDateValid) {
        if (recurrenceEndType === "BY_OCCURRENCES") {
          sessionCount = Math.min(recurrenceOccurrences, 52)
        } else if (recurrenceEndType === "INDEFINITE") {
          sessionCount = recurrenceType === "BIWEEKLY" ? 13 : 26
        } else if (recurrenceEndType === "BY_DATE") {
          const endObj = parseBrDate(recurrenceEndDate)
          if (endObj && endObj >= dateObj!) {
            const intervalDays = recurrenceType === "BIWEEKLY" ? 14 : 7
            let count = 0
            let cursor = new Date(dateObj!)
            while (cursor <= endObj && count < 52) {
              count++
              cursor = new Date(dateObj!.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
            }
            sessionCount = count
          }
        }
      }
    }
    // Silence unused import — addMonthsToDate kept for parity/future monthly support
    void addMonthsToDate

    return {
      whenHeader,
      timeRange,
      isDateValid,
      timeValid,
      primaryProfessional,
      recurrenceSummary,
      sessionCount,
      durationLabel: watchedDuration ? `${watchedDuration} min` : "—",
    }
  }, [
    watchedDate,
    watchedStartTime,
    computedEndTime,
    watchedDuration,
    professionals,
    effectivePrimaryId,
    isRecurring,
    recurrenceType,
    recurrenceEndType,
    recurrenceEndDate,
    recurrenceOccurrences,
    blocksTime,
  ])

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={NEW_ENTRY_TITLES[entryType]}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid md:grid-cols-[1fr_320px]">
          {/* ============================================
              LEFT — form grouped by section
              ============================================ */}
          <div className="p-4 md:p-6 space-y-5">
            <div>
              <Badge tone={ENTRY_TYPE_TONE[entryType]} dot>
                {typeLabel}
              </Badge>
            </div>

            {/* Título */}
            <div>
              <label htmlFor="entry-title" className={labelClass}>
                Título *
              </label>
              <input
                id="entry-title"
                type="text"
                placeholder={`Nome da ${typeLabel.toLowerCase()}…`}
                {...form.register("title")}
                className={inputClass}
              />
              {form.formState.errors.title && (
                <p className={errorClass}>{form.formState.errors.title.message}</p>
              )}
            </div>

            {/* Paciente (REUNIAO only) */}
            {entryType === "REUNIAO" && onPatientSearchChange && (
              <div>
                <PatientSearch
                  value={patientSearch || ""}
                  onChange={onPatientSearchChange}
                  selectedPatient={selectedPatient || null}
                  onSelectPatient={onSelectPatient || (() => {})}
                  onClearPatient={onClearPatient || (() => {})}
                />
                <p className="text-[11px] text-ink-500 mt-1">
                  Vincular paciente para gerar cobrança.
                </p>
              </div>
            )}

            {/* ---------- Horário ---------- */}
            <SectionLabel>Horário</SectionLabel>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-5">
                <label htmlFor="entry-date" className={labelClass}>
                  Data *
                </label>
                <DateInput id="entry-date" {...form.register("date")} className={inputClass} />
                {form.formState.errors.date && (
                  <p className={errorClass}>{form.formState.errors.date.message}</p>
                )}
              </div>
              <div className="col-span-6 md:col-span-3">
                <label htmlFor="entry-time" className={labelClass}>
                  Início *
                </label>
                <TimeInput
                  id="entry-time"
                  placeholder="HH:MM"
                  {...form.register("startTime")}
                  className={inputClass}
                />
                {form.formState.errors.startTime && (
                  <p className={errorClass}>{form.formState.errors.startTime.message}</p>
                )}
              </div>
              <div className="col-span-6 md:col-span-4">
                <label htmlFor="entry-duration" className={labelClass}>
                  Duração
                </label>
                <input
                  id="entry-duration"
                  type="number"
                  {...form.register("duration", {
                    setValueAs: (v: string) =>
                      v === "" || v === null || v === undefined || isNaN(Number(v))
                        ? undefined
                        : Number(v),
                  })}
                  min={5}
                  max={480}
                  step={5}
                  className={inputClass}
                />
                <p className="text-[11px] text-ink-500 mt-1 font-mono">
                  Fim {computedEndTime || "—"}
                </p>
              </div>
            </div>

            {/* ---------- Responsável ---------- */}
            {(isAdmin || entryType === "REUNIAO") && (
              <>
                <SectionLabel>Responsável</SectionLabel>
                <div className="grid grid-cols-12 gap-4">
                  {isAdmin && (
                    <div className="col-span-12">
                      <label htmlFor="entry-professional" className={labelClass}>
                        Profissional *
                      </label>
                      {isProfessionalLocked ? (
                        <div className={readonlyBoxClass}>
                          {professionals.find(
                            (p) => p.professionalProfile?.id === selectedProfessionalId
                          )?.name || "Profissional selecionado"}
                        </div>
                      ) : (
                        <select
                          id="entry-professional"
                          value={createProfessionalId}
                          onChange={(e) => setCreateProfessionalId(e.target.value)}
                          className={selectClass}
                        >
                          <option value="">Selecione um profissional</option>
                          {professionals.map((prof) => (
                            <option key={prof.id} value={prof.professionalProfile?.id || ""}>
                              {prof.name}
                              {prof.professionalProfile?.specialty &&
                                ` — ${prof.professionalProfile.specialty}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ---------- Recorrência ---------- */}
            <SectionLabel>Recorrência</SectionLabel>
            <div>
              <label className="flex items-center gap-2 text-[13px] text-ink-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
                />
                <span>Evento recorrente</span>
              </label>

              {isRecurring && (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-1.5">
                      Frequência
                    </p>
                    <Segmented<"WEEKLY" | "BIWEEKLY">
                      options={FREQUENCY_OPTIONS}
                      value={recurrenceType}
                      onChange={setRecurrenceType}
                      size="sm"
                      ariaLabel="Frequência"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-1.5">
                      Terminar
                    </p>
                    <Segmented<RecurrenceEndType>
                      options={END_TYPE_OPTIONS}
                      value={recurrenceEndType}
                      onChange={setRecurrenceEndType}
                      size="sm"
                      ariaLabel="Término da recorrência"
                    />
                  </div>

                  {recurrenceEndType === "BY_OCCURRENCES" && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-500 uppercase tracking-wider mb-1.5">
                        Nº de ocorrências
                      </label>
                      <input
                        type="number"
                        value={recurrenceOccurrences}
                        onChange={(e) => setRecurrenceOccurrences(Number(e.target.value))}
                        min={2}
                        max={52}
                        className="w-24 h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
                      />
                    </div>
                  )}
                  {recurrenceEndType === "BY_DATE" && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-500 uppercase tracking-wider mb-1.5">
                        Data final
                      </label>
                      <DateInput
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-40 h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ---------- Equipe adicional (REUNIAO) ---------- */}
            {entryType === "REUNIAO" && additionalProfessionalsAvailable.length > 0 && (
              <>
                <SectionLabel>
                  Equipe adicional{" "}
                  <span className="text-ink-400 font-normal normal-case tracking-normal ml-1">
                    (opcional)
                  </span>
                </SectionLabel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {additionalProfessionalsAvailable.map((prof) => {
                    const profId = prof.professionalProfile!.id
                    const checked = additionalProfessionalIds.includes(profId)
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
                            if (e.target.checked) {
                              setAdditionalProfessionalIds([...additionalProfessionalIds, profId])
                            } else {
                              setAdditionalProfessionalIds(
                                additionalProfessionalIds.filter((x) => x !== profId)
                              )
                            }
                          }}
                          className="w-4 h-4 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
                        />
                        <span className="font-medium text-ink-800 truncate">{prof.name}</span>
                        {prof.professionalProfile?.specialty && (
                          <span className="text-[11px] text-ink-500 font-mono truncate">
                            · {prof.professionalProfile.specialty}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            {/* ---------- Observações ---------- */}
            <div>
              <label htmlFor="entry-notes" className={labelClass}>
                Observações
              </label>
              <textarea
                id="entry-notes"
                rows={3}
                {...form.register("notes")}
                placeholder="Observações…"
                className={textareaClass}
              />
            </div>

            {/* Alerts */}
            {apiError && <InlineAlert message={apiError} onDismiss={onDismissError} />}

            {availabilityWarning && (
              <div className="flex flex-col gap-2 p-3 rounded-[4px] border bg-warn-50 border-warn-100 animate-scale-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangleIcon className="w-4 h-4 text-warn-700 flex-shrink-0 mt-0.5" />
                  <p className="flex-1 text-[13px] text-warn-700">{availabilityWarning}</p>
                  <button
                    type="button"
                    onClick={onDismissAvailabilityWarning}
                    className="flex-shrink-0 p-1 rounded-[2px] text-warn-700 hover:bg-warn-100 transition-colors"
                    aria-label="Fechar alerta"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onConfirmAvailabilityOverride}
                  disabled={isSaving}
                  className="w-full h-10 rounded-[4px] border border-warn-100 bg-warn-50 text-warn-700 font-medium text-[13px] hover:bg-warn-100 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? "Salvando..." : "Criar mesmo assim"}
                </button>
              </div>
            )}
          </div>

          {/* ============================================
              RIGHT — live preview sidebar
              ============================================ */}
          <aside className="border-t md:border-t-0 md:border-l border-ink-200 bg-gradient-to-b from-ink-50 to-card p-4 md:p-6 flex flex-col gap-5">
            <SidebarLabel>Pré-visualização</SidebarLabel>

            {/* Preview header */}
            <div
              className={`px-3.5 py-3 rounded-[4px] ${ENTRY_HEADER_BG[entryType]} text-white flex items-center gap-2.5`}
            >
              <TypeIcon className="w-4 h-4 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-mono opacity-85 tracking-wider">
                  {preview.whenHeader}
                </div>
                <div className="text-[15px] font-semibold mt-0.5 tracking-tight">
                  {preview.timeRange}
                </div>
              </div>
            </div>

            {/* Preview card */}
            <div className="bg-card rounded-[6px] border border-ink-200 shadow-sm p-4 space-y-3">
              <PreviewRow
                icon={<CalendarIcon className="w-4 h-4" />}
                label="Título"
                value={watchedTitle || undefined}
                placeholder={`Nova ${typeLabel.toLowerCase()}`}
              />
              {entryType === "REUNIAO" && (
                <PreviewRow
                  icon={<UserIcon className="w-4 h-4" />}
                  label="Paciente"
                  value={selectedPatient?.name || undefined}
                  placeholder="—"
                />
              )}
              <PreviewRow
                icon={<UsersIcon className="w-4 h-4" />}
                label="Profissional"
                value={preview.primaryProfessional?.name}
                placeholder="—"
              />
              {blocksTime && (
                <PreviewRow
                  icon={<ClockIcon className="w-4 h-4" />}
                  label="Duração"
                  value={preview.durationLabel}
                />
              )}
              <PreviewRow
                icon={<RefreshCwIcon className="w-4 h-4" />}
                label="Recorrência"
                value={preview.recurrenceSummary}
              />
              {entryType === "REUNIAO" && additionalProfessionalIds.length > 0 && (
                <PreviewRow
                  icon={<UsersIcon className="w-4 h-4" />}
                  label="Equipe"
                  value={`+${additionalProfessionalIds.length} ${
                    additionalProfessionalIds.length === 1 ? "profissional" : "profissionais"
                  }`}
                />
              )}
            </div>

            {isRecurring && preview.sessionCount > 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-[4px] bg-brand-50 border border-brand-100 text-[12px] text-brand-800 leading-[1.45]">
                <InfoIcon className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
                <span>
                  Serão criadas{" "}
                  <strong className="font-semibold">~{preview.sessionCount} ocorrências</strong>
                  {recurrenceEndType === "INDEFINITE" && " nos próximos 6 meses"}. Você pode pausar
                  a qualquer momento.
                </span>
              </div>
            )}

            {/* LEMBRETE / NOTA aren't time-blocking — skip the availability strip
                for those since there's no conflict to detect. */}
            {blocksTime && (
              <div className="mt-auto">
                <SidebarLabel>Disponibilidade</SidebarLabel>
                <div className="mt-2">
                  {availabilityWarning ? (
                    <div className="flex items-start gap-2 text-[12px] text-warn-700">
                      <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Conflito com outro evento na agenda</span>
                    </div>
                  ) : preview.isDateValid && preview.timeValid ? (
                    <div className="flex items-center gap-2 text-[12px] text-ok-700">
                      <CheckIcon className="w-4 h-4 text-ok-500" />
                      <span>Horário livre na agenda</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[12px] text-ink-500">
                      <InfoIcon className="w-4 h-4" />
                      <span>Defina data e horário</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!blocksTime && (
              <div className="mt-auto flex items-start gap-2 text-[12px] text-ink-500">
                <InfoIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  {entryType === "LEMBRETE"
                    ? "Lembretes não bloqueiam horários da agenda."
                    : "Notas não bloqueiam horários da agenda."}
                </span>
              </div>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="border-t border-ink-200 bg-ink-50 px-4 md:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[12px] text-ink-500">
            <ClipboardListIcon className="w-3.5 h-3.5" />
            <span>{typeLabel} aparece na agenda assim que criada</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || (isAdmin && !isProfessionalLocked && !createProfessionalId)}
              className="h-10 px-4 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Salvando..." : `Criar ${typeLabel}`}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}

/* ============================================
   Local presentational helpers
   ============================================ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
      <span>{children}</span>
      <span className="flex-1 h-px bg-ink-200" />
    </div>
  )
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
      {children}
    </div>
  )
}

function PreviewRow({
  icon,
  label,
  value,
  placeholder = "—",
}: {
  icon: React.ReactNode
  label: string
  value?: string | null
  placeholder?: string
}) {
  const hasValue = !!value
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="text-ink-400 flex-shrink-0">{icon}</span>
      <span className="text-ink-600">{label}</span>
      <span
        className={`ml-auto truncate max-w-[60%] text-right ${
          hasValue ? "text-ink-900 font-medium" : "text-ink-400 italic"
        }`}
      >
        {hasValue ? value : placeholder}
      </span>
    </div>
  )
}
