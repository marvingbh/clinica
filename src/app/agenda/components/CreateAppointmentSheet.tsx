"use client"

import { useMemo } from "react"
import { UseFormReturn } from "react-hook-form"
import {
  BuildingIcon,
  VideoIcon,
  CalendarIcon,
  AlertTriangleIcon,
  XIcon,
  UserIcon,
  UsersIcon,
  ClockIcon,
  RefreshCwIcon,
  CheckIcon,
  InfoIcon,
  Segmented,
  type SegmentedOption,
} from "@/shared/components/ui"
import { Sheet } from "./Sheet"
import { PatientSearch } from "./PatientSearch"
import { RecurrenceOptions, FREQUENCY_OPTIONS } from "./RecurrenceOptions"
import { InlineAlert } from "./InlineAlert"
import { TimeInput } from "./TimeInput"
import { DateInput } from "./DateInput"
import { calculateEndTime, addMonthsToDate } from "../lib/utils"
import { MAX_RECURRENCE_OCCURRENCES } from "../lib/constants"
import type {
  AppointmentFormData,
  Professional,
  Patient,
  RecurrenceEndType,
} from "../lib/types"
import type { AppointmentType } from "./RecurrenceOptions"

const labelClass = "block text-[12px] font-medium text-ink-700 mb-1.5"
const inputClass =
  "w-full h-11 md:h-10 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed"
const selectClass = inputClass + " appearance-none pr-8 bg-no-repeat bg-[right_0.6rem_center] bg-[length:12px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 20 20%22 fill=%22none%22 stroke=%22%2364748B%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 8 10 12 14 8%22/></svg>')]"
const textareaClass =
  "w-full px-3 py-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] resize-none min-h-[84px]"
const errorClass = "text-[12px] text-err-700 mt-1"
const readonlyBoxClass =
  "w-full h-11 md:h-10 px-3 rounded-[4px] border border-ink-200 bg-ink-50 text-ink-700 text-[13px] flex items-center"

// Small helpers local to the sheet — uppercase pt-BR day/month abbreviations
// for the preview header ("SEG · 27 ABR 2026").
const DAY_ABBR = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]
const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
const FREQUENCY_LABEL: Record<AppointmentType, string> = {
  SINGLE: "Única",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
}
const FREQUENCY_DAILY_AVG: Record<AppointmentType, number> = {
  SINGLE: 0,
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
}

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

interface CreateAppointmentSheetProps {
  isOpen: boolean
  onClose: () => void
  form: UseFormReturn<AppointmentFormData>
  patientSearch: string
  onPatientSearchChange: (value: string) => void
  selectedPatient: Patient | null
  onSelectPatient: (patient: Patient) => void
  onClearPatient: () => void
  appointmentType: AppointmentType
  onAppointmentTypeChange: (type: AppointmentType) => void
  recurrenceEndType: RecurrenceEndType
  onRecurrenceEndTypeChange: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  onRecurrenceEndDateChange: (date: string) => void
  recurrenceOccurrences: number
  onRecurrenceOccurrencesChange: (n: number) => void
  isAdmin: boolean
  professionals: Professional[]
  createProfessionalId: string
  onCreateProfessionalIdChange: (id: string) => void
  isProfessionalLocked: boolean
  selectedProfessionalId: string | null
  additionalProfessionalIds: string[]
  onAdditionalProfessionalIdsChange: (ids: string[]) => void
  appointmentDuration: number
  apiError: string | null
  onDismissError: () => void
  availabilityWarning?: string | null
  onConfirmAvailabilityOverride?: () => void
  onDismissAvailabilityWarning?: () => void
  isSaving: boolean
  onSubmit: (data: AppointmentFormData) => void
}

export function CreateAppointmentSheet({
  isOpen,
  onClose,
  form,
  patientSearch,
  onPatientSearchChange,
  selectedPatient,
  onSelectPatient,
  onClearPatient,
  appointmentType,
  onAppointmentTypeChange,
  recurrenceEndType,
  onRecurrenceEndTypeChange,
  recurrenceEndDate,
  onRecurrenceEndDateChange,
  recurrenceOccurrences,
  onRecurrenceOccurrencesChange,
  isAdmin,
  professionals,
  createProfessionalId,
  onCreateProfessionalIdChange,
  isProfessionalLocked,
  selectedProfessionalId,
  additionalProfessionalIds,
  onAdditionalProfessionalIdsChange,
  appointmentDuration,
  apiError,
  onDismissError,
  availabilityWarning,
  onConfirmAvailabilityOverride,
  onDismissAvailabilityWarning,
  isSaving,
  onSubmit,
}: CreateAppointmentSheetProps) {
  const watchedDate = form.watch("date") || ""
  const watchedStartTime = form.watch("startTime") || ""
  const watchedDuration = form.watch("duration")
  const watchedModality = form.watch("modality") ?? "PRESENCIAL"
  const effectiveDuration = watchedDuration || appointmentDuration
  const computedEndTime = calculateEndTime(watchedStartTime, effectiveDuration) || ""

  const effectivePrimaryId = selectedProfessionalId || createProfessionalId
  const additionalProfessionalsAvailable = professionals.filter(
    (p) => p.professionalProfile?.id && p.professionalProfile.id !== effectivePrimaryId
  )

  const modalityOptions: SegmentedOption<"PRESENCIAL" | "ONLINE">[] = [
    { value: "PRESENCIAL", label: "Presencial", icon: <BuildingIcon className="w-3 h-3" /> },
    { value: "ONLINE", label: "Online", icon: <VideoIcon className="w-3 h-3" /> },
  ]

  // Preview values — derived, not stored.
  const preview = useMemo(() => {
    const dateObj = parseBrDate(watchedDate)
    const isDateValid = !!dateObj
    const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(watchedStartTime)

    const whenHeader = isDateValid
      ? `${DAY_ABBR[dateObj!.getDay()]} · ${String(dateObj!.getDate()).padStart(2, "0")} ${MONTH_ABBR[dateObj!.getMonth()]} ${dateObj!.getFullYear()}`
      : "Defina a data"

    let timeRange: string
    if (timeValid && computedEndTime) timeRange = `${watchedStartTime} → ${computedEndTime}`
    else if (timeValid) timeRange = watchedStartTime
    else timeRange = "Defina o horário"

    const primaryProfessional = professionals.find(
      (p) => p.professionalProfile?.id === effectivePrimaryId
    )

    const isRecurring = appointmentType !== "SINGLE"
    let recurrenceSummary: string
    if (!isRecurring) {
      recurrenceSummary = "Única"
    } else if (recurrenceEndType === "INDEFINITE") {
      recurrenceSummary = `${FREQUENCY_LABEL[appointmentType]} · sem fim`
    } else if (recurrenceEndType === "BY_OCCURRENCES") {
      recurrenceSummary = `${FREQUENCY_LABEL[appointmentType]} · ${recurrenceOccurrences} sessões`
    } else {
      recurrenceSummary = recurrenceEndDate
        ? `${FREQUENCY_LABEL[appointmentType]} · até ${recurrenceEndDate}`
        : `${FREQUENCY_LABEL[appointmentType]} · até —`
    }

    // Count of projected sessions — for the rule-strip.
    let sessionCount = 0
    if (isRecurring && isDateValid) {
      if (recurrenceEndType === "BY_OCCURRENCES") {
        sessionCount = Math.min(recurrenceOccurrences, MAX_RECURRENCE_OCCURRENCES)
      } else if (recurrenceEndType === "INDEFINITE") {
        if (appointmentType === "MONTHLY") sessionCount = 6
        else sessionCount = Math.floor(180 / FREQUENCY_DAILY_AVG[appointmentType])
      } else if (recurrenceEndType === "BY_DATE") {
        const endObj = parseBrDate(recurrenceEndDate)
        if (endObj && endObj >= dateObj!) {
          let count = 0
          let cursor = new Date(dateObj!)
          const intervalDays =
            appointmentType === "BIWEEKLY" ? 14 : appointmentType === "MONTHLY" ? 0 : 7
          while (cursor <= endObj && count < MAX_RECURRENCE_OCCURRENCES) {
            count++
            if (appointmentType === "MONTHLY") {
              cursor = addMonthsToDate(dateObj!, count)
            } else {
              cursor = new Date(dateObj!.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
            }
          }
          sessionCount = count
        }
      }
    }

    return {
      whenHeader,
      timeRange,
      isDateValid,
      timeValid,
      primaryProfessional,
      modalityLabel: watchedModality === "ONLINE" ? "Online" : "Presencial",
      durationLabel: `${effectiveDuration} min`,
      recurrenceSummary,
      sessionCount,
      isRecurring,
    }
  }, [
    watchedDate,
    watchedStartTime,
    watchedModality,
    computedEndTime,
    effectiveDuration,
    professionals,
    effectivePrimaryId,
    appointmentType,
    recurrenceEndType,
    recurrenceEndDate,
    recurrenceOccurrences,
  ])

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Novo Agendamento">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid md:grid-cols-[1fr_320px]">
          {/* ============================================
              LEFT — form, grouped by section
              ============================================ */}
          <div className="p-4 md:p-6 space-y-5">
            {/* Paciente */}
            <div>
              <PatientSearch
                value={patientSearch}
                onChange={onPatientSearchChange}
                selectedPatient={selectedPatient}
                onSelectPatient={onSelectPatient}
                onClearPatient={onClearPatient}
                error={form.formState.errors.patientId?.message}
              />
              <input type="hidden" {...form.register("patientId")} />
            </div>

            {/* ---------- Horário ---------- */}
            <SectionLabel>Horário</SectionLabel>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-5">
                <label htmlFor="date" className={labelClass}>
                  Data *
                </label>
                <DateInput id="date" {...form.register("date")} className={inputClass} />
                {form.formState.errors.date && (
                  <p className={errorClass}>{form.formState.errors.date.message}</p>
                )}
              </div>
              <div className="col-span-6 md:col-span-3">
                <label htmlFor="startTime" className={labelClass}>
                  Início *
                </label>
                <TimeInput
                  id="startTime"
                  placeholder="HH:MM"
                  {...form.register("startTime")}
                  className={inputClass}
                />
                {form.formState.errors.startTime && (
                  <p className={errorClass}>{form.formState.errors.startTime.message}</p>
                )}
              </div>
              <div className="col-span-6 md:col-span-4">
                <label htmlFor="duration" className={labelClass}>
                  Duração
                </label>
                <input
                  id="duration"
                  type="number"
                  {...form.register("duration", {
                    setValueAs: (v: string) =>
                      v === "" || v === null || v === undefined || isNaN(Number(v))
                        ? undefined
                        : Number(v),
                  })}
                  placeholder={`${appointmentDuration}`}
                  min={15}
                  max={480}
                  step={5}
                  className={inputClass}
                />
                <p className="text-[11px] text-ink-500 mt-1 font-mono">
                  Fim {computedEndTime || "—"} · padrão {appointmentDuration} min
                </p>
              </div>
            </div>

            {/* ---------- Tipo de atendimento ---------- */}
            <SectionLabel>Tipo de atendimento</SectionLabel>
            <div className="grid grid-cols-12 gap-4 items-start">
              <div className="col-span-12 md:col-span-6">
                <label className={labelClass}>Modalidade *</label>
                <Segmented
                  options={modalityOptions}
                  value={watchedModality as "PRESENCIAL" | "ONLINE"}
                  onChange={(v) =>
                    form.setValue("modality", v, { shouldDirty: true, shouldValidate: true })
                  }
                  size="sm"
                  ariaLabel="Modalidade"
                />
              </div>
              {isAdmin && (
                <div className="col-span-12 md:col-span-6">
                  <label htmlFor="createProfessional" className={labelClass}>
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
                      id="createProfessional"
                      value={createProfessionalId}
                      onChange={(e) => onCreateProfessionalIdChange(e.target.value)}
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

            {/* ---------- Recorrência ---------- */}
            <SectionLabel>Recorrência</SectionLabel>
            <div>
              <Segmented
                options={FREQUENCY_OPTIONS}
                value={appointmentType}
                onChange={onAppointmentTypeChange}
                size="sm"
                ariaLabel="Frequência"
              />
              <div className="mt-3">
                <RecurrenceOptions
                  appointmentType={appointmentType}
                  onAppointmentTypeChange={onAppointmentTypeChange}
                  recurrenceEndType={recurrenceEndType}
                  onRecurrenceEndTypeChange={onRecurrenceEndTypeChange}
                  occurrences={recurrenceOccurrences}
                  onOccurrencesChange={onRecurrenceOccurrencesChange}
                  endDate={recurrenceEndDate}
                  onEndDateChange={onRecurrenceEndDateChange}
                  minDate={watchedDate}
                  startDate={watchedDate}
                  startTime={watchedStartTime}
                  hideFrequency
                />
              </div>
            </div>

            {/* ---------- Equipe adicional ---------- */}
            {additionalProfessionalsAvailable.length > 0 && (
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
                              onAdditionalProfessionalIdsChange([
                                ...additionalProfessionalIds,
                                profId,
                              ])
                            } else {
                              onAdditionalProfessionalIdsChange(
                                additionalProfessionalIds.filter((x) => x !== profId)
                              )
                            }
                          }}
                          className="w-4 h-4 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
                        />
                        <span className="flex items-center gap-2 min-w-0 flex-1">
                          <Avatar name={prof.name} />
                          <span className="font-medium text-ink-800 truncate">{prof.name}</span>
                          {prof.professionalProfile?.specialty && (
                            <span className="text-[11px] text-ink-500 font-mono truncate">
                              · {prof.professionalProfile.specialty}
                            </span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            {/* ---------- Observações ---------- */}
            <div>
              <label htmlFor="notes" className={labelClass}>
                Observações
              </label>
              <textarea
                id="notes"
                rows={3}
                {...form.register("notes")}
                placeholder="Observações sobre a consulta..."
                className={textareaClass}
              />
            </div>

            {/* Inline alerts (in-flow; stay with main column so preview is clean) */}
            {apiError && (
              <InlineAlert message={apiError} onDismiss={onDismissError} />
            )}

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

            {/* Preview header — date + time, brand background */}
            <div className="px-3.5 py-3 rounded-[4px] bg-brand-500 text-white flex items-center gap-2.5">
              <CalendarIcon className="w-4 h-4 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-mono opacity-85 tracking-wider">
                  {preview.whenHeader}
                </div>
                <div className="text-[15px] font-semibold mt-0.5 tracking-tight">
                  {preview.timeRange}
                </div>
              </div>
            </div>

            {/* Preview card — field-by-field summary */}
            <div className="bg-card rounded-[6px] border border-ink-200 shadow-sm p-4 space-y-3">
              <PreviewRow
                icon={<UserIcon className="w-4 h-4" />}
                label="Paciente"
                value={selectedPatient?.name}
                placeholder="Nenhum selecionado"
              />
              <PreviewRow
                icon={<UsersIcon className="w-4 h-4" />}
                label="Profissional"
                value={preview.primaryProfessional?.name}
                placeholder="—"
              />
              <PreviewRow
                icon={
                  watchedModality === "ONLINE" ? (
                    <VideoIcon className="w-4 h-4" />
                  ) : (
                    <BuildingIcon className="w-4 h-4" />
                  )
                }
                label="Modalidade"
                value={preview.modalityLabel}
              />
              <PreviewRow
                icon={<ClockIcon className="w-4 h-4" />}
                label="Duração"
                value={preview.durationLabel}
              />
              <PreviewRow
                icon={<RefreshCwIcon className="w-4 h-4" />}
                label="Recorrência"
                value={preview.recurrenceSummary}
              />
              {additionalProfessionalIds.length > 0 && (
                <PreviewRow
                  icon={<UsersIcon className="w-4 h-4" />}
                  label="Equipe"
                  value={`+${additionalProfessionalIds.length} ${
                    additionalProfessionalIds.length === 1 ? "profissional" : "profissionais"
                  }`}
                />
              )}
            </div>

            {preview.isRecurring && preview.sessionCount > 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-[4px] bg-brand-50 border border-brand-100 text-[12px] text-brand-800 leading-[1.45]">
                <InfoIcon className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
                <span>
                  Serão criadas <strong className="font-semibold">~{preview.sessionCount} sessões</strong>
                  {recurrenceEndType === "INDEFINITE" && " nos próximos 6 meses"}
                  . Você pode finalizar ou pausar a qualquer momento.
                </span>
              </div>
            )}

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
          </aside>
        </div>

        {/* Footer — full-width action bar on an ink-50 strip */}
        <div className="border-t border-ink-200 bg-ink-50 px-4 md:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[12px] text-ink-500">
            <InfoIcon className="w-3.5 h-3.5" />
            <span>Alterações sincronizadas com a agenda</span>
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
              disabled={
                isSaving ||
                !selectedPatient ||
                (isAdmin && !isProfessionalLocked && !createProfessionalId)
              }
              className="h-10 px-4 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              <CalendarIcon className="w-4 h-4" />
              {isSaving ? "Salvando..." : "Agendar consulta"}
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

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 border border-brand-200 text-[10px] font-semibold inline-grid place-items-center flex-shrink-0">
      {initials}
    </span>
  )
}
