"use client"

import { useCallback, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  BuildingIcon,
  VideoIcon,
  XIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  UserIcon,
  RefreshCwIcon,
  InfoIcon,
  CheckIcon,
  AlertTriangleIcon,
  Segmented,
  ChipField,
  type SegmentedOption,
} from "@/shared/components/ui"
import { Sheet } from "./Sheet"
import { MultiPatientSearch } from "./MultiPatientSearch"
import { TimeInput } from "./TimeInput"
import { DateInput } from "./DateInput"
import { InlineAlert } from "./InlineAlert"
import { calculateEndTime } from "../lib/utils"
import { createGroupSession } from "../services/appointmentService"
import { addGroupMember, createTherapyGroup, generateGroupSessions } from "../services/groupService"
import { toast } from "sonner"
import type { Patient, Professional } from "../lib/types"

const brDateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const groupSessionSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").max(200),
  date: z.string().regex(brDateRegex, "Data inválida (DD/MM/AAAA)"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
})

type GroupSessionFormData = z.infer<typeof groupSessionSchema>

function brDateToISO(brDate: string): string {
  const match = brDate.match(brDateRegex)
  if (!match) return ""
  return `${match[3]}-${match[2]}-${match[1]}`
}

const DAY_ABBR = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]
const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

const LABEL = "block text-[12px] font-medium text-ink-700 mb-1.5"
const INPUT =
  "w-full h-11 md:h-10 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] disabled:bg-ink-100 disabled:text-ink-500"
const SELECT =
  INPUT +
  " appearance-none pr-8 bg-no-repeat bg-[right_0.6rem_center] bg-[length:12px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 20 20%22 fill=%22none%22 stroke=%22%2364748B%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 8 10 12 14 8%22/></svg>')]"
const TEXTAREA =
  "w-full px-3 py-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] resize-none min-h-[84px]"
const ERROR = "text-[12px] text-err-700 mt-1"

const MODALITY_OPTIONS: SegmentedOption<"PRESENCIAL" | "ONLINE">[] = [
  { value: "PRESENCIAL", label: "Presencial", icon: <BuildingIcon className="w-3 h-3" /> },
  { value: "ONLINE", label: "Online", icon: <VideoIcon className="w-3 h-3" /> },
]

const FREQUENCY_OPTIONS: SegmentedOption<"WEEKLY" | "BIWEEKLY" | "MONTHLY">[] = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
  { value: "MONTHLY", label: "Mensal" },
]

function parseBrDate(value: string): Date | null {
  const m = value?.match(brDateRegex)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

interface CreateGroupSessionSheetProps {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
  professionals: Professional[]
  createProfessionalId: string
  onCreateProfessionalIdChange: (id: string) => void
  isProfessionalLocked: boolean
  selectedProfessionalId: string | null
  additionalProfessionalIds: string[]
  onAdditionalProfessionalIdsChange: (ids: string[]) => void
  appointmentDuration: number
  defaultDate?: string
  defaultTime?: string
  onCreated: () => void
}

export function CreateGroupSessionSheet({
  isOpen,
  onClose,
  isAdmin,
  professionals,
  createProfessionalId,
  onCreateProfessionalIdChange,
  isProfessionalLocked,
  selectedProfessionalId,
  additionalProfessionalIds,
  onAdditionalProfessionalIdsChange,
  appointmentDuration,
  defaultDate,
  defaultTime,
  onCreated,
}: CreateGroupSessionSheetProps) {
  const [selectedPatients, setSelectedPatients] = useState<Patient[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null)
  const [skipAvailability, setSkipAvailability] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("WEEKLY")

  const form = useForm<GroupSessionFormData>({
    resolver: zodResolver(groupSessionSchema),
    defaultValues: {
      title: "",
      date: defaultDate || "",
      startTime: defaultTime || "",
      duration: appointmentDuration,
      modality: "PRESENCIAL",
      notes: "",
    },
  })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form

  const watchedTitle = watch("title") || ""
  const watchedDate = watch("date") || ""
  const watchedStartTime = watch("startTime") || ""
  const watchedDuration = watch("duration") || appointmentDuration
  const watchedModality = watch("modality")

  const computedEndTime = calculateEndTime(watchedStartTime, watchedDuration) || ""
  const effectivePrimaryId = createProfessionalId || selectedProfessionalId

  const preview = useMemo(() => {
    const dateObj = parseBrDate(watchedDate)
    const isDateValid = !!dateObj
    const timeValid = timeRegex.test(watchedStartTime)

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

    let recurrenceSummary = "Única"
    let sessionCount = 0
    if (isRecurring) {
      const FREQ: Record<typeof recurrenceType, string> = {
        WEEKLY: "Semanal",
        BIWEEKLY: "Quinzenal",
        MONTHLY: "Mensal",
      }
      recurrenceSummary = `${FREQ[recurrenceType]} · 6 meses`
      if (recurrenceType === "WEEKLY") sessionCount = 26
      else if (recurrenceType === "BIWEEKLY") sessionCount = 13
      else sessionCount = 6
    }

    return {
      whenHeader,
      timeRange,
      isDateValid,
      timeValid,
      primaryProfessional,
      recurrenceSummary,
      sessionCount,
      durationLabel: `${watchedDuration} min`,
      modalityLabel: watchedModality === "ONLINE" ? "Online" : "Presencial",
    }
  }, [
    watchedDate,
    watchedStartTime,
    computedEndTime,
    watchedDuration,
    watchedModality,
    professionals,
    effectivePrimaryId,
    isRecurring,
    recurrenceType,
  ])

  const handleAddPatient = useCallback((patient: Patient) => {
    setSelectedPatients((prev) => {
      if (prev.some((p) => p.id === patient.id)) return prev
      return [...prev, patient]
    })
  }, [])

  const handleRemovePatient = useCallback((patientId: string) => {
    setSelectedPatients((prev) => prev.filter((p) => p.id !== patientId))
  }, [])

  const onSubmit = async (data: GroupSessionFormData) => {
    if (selectedPatients.length < 2) {
      setApiError("Selecione pelo menos 2 pacientes")
      return
    }

    setIsSubmitting(true)
    setApiError(null)

    const isoDate = brDateToISO(data.date)

    if (isRecurring) {
      await submitRecurringGroup(data, isoDate)
    } else {
      await submitOneOffSession(data, isoDate)
    }
  }

  const submitOneOffSession = async (data: GroupSessionFormData, isoDate: string) => {
    const result = await createGroupSession({
      patientIds: selectedPatients.map((p) => p.id),
      title: data.title,
      date: isoDate,
      startTime: data.startTime,
      duration: data.duration,
      modality: data.modality,
      notes: data.notes,
      professionalProfileId: createProfessionalId || undefined,
      additionalProfessionalIds:
        additionalProfessionalIds.length > 0 ? additionalProfessionalIds : undefined,
      skipAvailabilityCheck: skipAvailability,
    })

    setIsSubmitting(false)

    if (result.error) {
      if (result.availabilityWarning) setAvailabilityWarning(result.error)
      else setApiError(result.error)
      return
    }

    toast.success(`Sessão em grupo criada com ${selectedPatients.length} pacientes`)
    resetAndClose()
  }

  const submitRecurringGroup = async (data: GroupSessionFormData, isoDate: string) => {
    try {
      const dateObj = new Date(isoDate + "T12:00:00")

      const effectiveProfId = createProfessionalId || selectedProfessionalId || undefined
      const groupResult = await createTherapyGroup({
        name: data.title,
        dayOfWeek: dateObj.getDay(),
        startTime: data.startTime,
        duration: data.duration || appointmentDuration,
        recurrenceType,
        professionalProfileId: effectiveProfId,
        additionalProfessionalIds:
          additionalProfessionalIds.length > 0 ? additionalProfessionalIds : undefined,
      })
      if (groupResult.error || !groupResult.groupId) {
        setApiError(groupResult.error || "Erro ao criar grupo")
        setIsSubmitting(false)
        return
      }

      for (const patient of selectedPatients) {
        const result = await addGroupMember(groupResult.groupId, patient.id, isoDate)
        if (result.error) {
          setApiError(`Erro ao adicionar ${patient.name}: ${result.error}`)
          setIsSubmitting(false)
          return
        }
      }

      const endDate = new Date(dateObj)
      endDate.setMonth(endDate.getMonth() + 6)
      const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(endDate.getDate()).padStart(2, "0")}`

      const sessionsResult = await generateGroupSessions(groupResult.groupId, isoDate, endDateStr)
      if (sessionsResult.error) {
        setApiError(sessionsResult.error)
        setIsSubmitting(false)
        return
      }

      toast.success(`Grupo "${data.title}" criado com ${sessionsResult.sessionsCreated} sessões`)
      resetAndClose()
    } catch {
      setApiError("Erro ao criar grupo recorrente")
      setIsSubmitting(false)
    }
  }

  const resetAndClose = () => {
    setSelectedPatients([])
    form.reset()
    setSkipAvailability(false)
    setIsRecurring(false)
    setRecurrenceType("WEEKLY")
    onCreated()
    onClose()
  }

  const handleConfirmAvailabilityOverride = () => {
    setAvailabilityWarning(null)
    setSkipAvailability(true)
    handleSubmit(onSubmit)()
  }

  const handleClose = () => {
    setSelectedPatients([])
    setApiError(null)
    setAvailabilityWarning(null)
    setSkipAvailability(false)
    setIsRecurring(false)
    setRecurrenceType("WEEKLY")
    form.reset()
    onClose()
  }

  const additionalProfessionalsAvailable = professionals.filter(
    (p) => p.professionalProfile?.id && p.professionalProfile.id !== effectivePrimaryId
  )

  return (
    <Sheet isOpen={isOpen} onClose={handleClose} title="Nova Sessão em Grupo">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid md:grid-cols-[1fr_320px]">
          {/* ============================================
              LEFT — grouped form sections
              ============================================ */}
          <div className="p-4 md:p-6 space-y-5">
            {/* Pacientes */}
            <div>
              <MultiPatientSearch
                selectedPatients={selectedPatients}
                onAddPatient={handleAddPatient}
                onRemovePatient={handleRemovePatient}
                error={
                  selectedPatients.length > 0 && selectedPatients.length < 2
                    ? "Selecione pelo menos 2 pacientes"
                    : undefined
                }
              />
            </div>

            {/* Título */}
            <div>
              <label htmlFor="gs-title" className={LABEL}>
                Título *
              </label>
              <input
                id="gs-title"
                type="text"
                {...register("title")}
                placeholder="Ex: Grupo de ansiedade"
                className={INPUT}
              />
              {errors.title && <p className={ERROR}>{errors.title.message}</p>}
            </div>

            {/* Horário */}
            <GroupSectionLabel>Horário</GroupSectionLabel>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-5">
                <label htmlFor="gs-date" className={LABEL}>
                  Data *
                </label>
                <DateInput id="gs-date" {...register("date")} className={INPUT} />
                {errors.date && <p className={ERROR}>{errors.date.message}</p>}
              </div>
              <div className="col-span-6 md:col-span-3">
                <label htmlFor="gs-startTime" className={LABEL}>
                  Início *
                </label>
                <TimeInput
                  id="gs-startTime"
                  placeholder="HH:MM"
                  {...register("startTime")}
                  className={INPUT}
                />
                {errors.startTime && <p className={ERROR}>{errors.startTime.message}</p>}
              </div>
              <div className="col-span-6 md:col-span-4">
                <label htmlFor="gs-duration" className={LABEL}>
                  Duração
                </label>
                <input
                  id="gs-duration"
                  type="number"
                  {...register("duration", { valueAsNumber: true })}
                  min={15}
                  max={480}
                  step={5}
                  className={INPUT}
                />
                <p className="text-[11px] text-ink-500 mt-1 font-mono">
                  Fim {computedEndTime || "—"}
                </p>
              </div>
            </div>

            {/* Tipo de atendimento */}
            <GroupSectionLabel>Tipo de atendimento</GroupSectionLabel>
            <div className="grid grid-cols-12 gap-4 items-start">
              <div className="col-span-12 md:col-span-6">
                <label className={LABEL}>Modalidade *</label>
                <Segmented<"PRESENCIAL" | "ONLINE">
                  options={MODALITY_OPTIONS}
                  value={watchedModality}
                  onChange={(v) => setValue("modality", v, { shouldDirty: true })}
                  size="sm"
                  ariaLabel="Modalidade"
                />
              </div>
              {isAdmin && professionals.length > 1 && !isProfessionalLocked && (
                <div className="col-span-12 md:col-span-6">
                  <label htmlFor="gs-prof" className={LABEL}>
                    Profissional *
                  </label>
                  <select
                    id="gs-prof"
                    value={createProfessionalId}
                    onChange={(e) => onCreateProfessionalIdChange(e.target.value)}
                    className={SELECT}
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
                </div>
              )}
            </div>

            {/* Recorrência */}
            <GroupSectionLabel>Recorrência</GroupSectionLabel>
            <div>
              <label className="flex items-center gap-2 text-[13px] text-ink-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
                />
                <span>Grupo recorrente — cria sessões para 6 meses</span>
              </label>
              {isRecurring && (
                <div className="mt-3">
                  <ChipField label="Frequência">
                    <Segmented<"WEEKLY" | "BIWEEKLY" | "MONTHLY">
                      options={FREQUENCY_OPTIONS}
                      value={recurrenceType}
                      onChange={setRecurrenceType}
                      size="sm"
                      ariaLabel="Frequência"
                    />
                  </ChipField>
                </div>
              )}
            </div>

            {/* Equipe adicional */}
            {additionalProfessionalsAvailable.length > 0 && (
              <>
                <GroupSectionLabel>
                  Equipe adicional{" "}
                  <span className="text-ink-400 font-normal normal-case tracking-normal ml-1">
                    (opcional)
                  </span>
                </GroupSectionLabel>
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
                        <span className="font-medium text-ink-800 truncate">{prof.name}</span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            {/* Observações */}
            <div>
              <label htmlFor="gs-notes" className={LABEL}>
                Observações
              </label>
              <textarea
                id="gs-notes"
                {...register("notes")}
                rows={3}
                className={TEXTAREA}
                placeholder="Observações opcionais..."
              />
            </div>

            {apiError && (
              <InlineAlert variant="error" message={apiError} onDismiss={() => setApiError(null)} />
            )}

            {availabilityWarning && (
              <div className="flex flex-col gap-2 p-3 rounded-[4px] border bg-warn-50 border-warn-100">
                <div className="flex items-start gap-2.5">
                  <AlertTriangleIcon className="w-4 h-4 text-warn-700 flex-shrink-0 mt-0.5" />
                  <p className="flex-1 text-[13px] text-warn-700">{availabilityWarning}</p>
                  <button
                    type="button"
                    onClick={() => setAvailabilityWarning(null)}
                    className="flex-shrink-0 p-1 rounded-[2px] text-warn-700 hover:bg-warn-100 transition-colors"
                    aria-label="Fechar alerta"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleConfirmAvailabilityOverride}
                  disabled={isSubmitting}
                  className="w-full h-10 rounded-[4px] border border-warn-100 bg-warn-50 text-warn-700 font-medium text-[13px] hover:bg-warn-100 disabled:opacity-50 transition-colors"
                >
                  Agendar mesmo assim
                </button>
              </div>
            )}
          </div>

          {/* ============================================
              RIGHT — live preview
              ============================================ */}
          <aside className="border-t md:border-t-0 md:border-l border-ink-200 bg-gradient-to-b from-ink-50 to-card p-4 md:p-6 flex flex-col gap-5">
            <GroupSidebarLabel>Pré-visualização</GroupSidebarLabel>

            <div className="px-3.5 py-3 rounded-[4px] bg-brand-500 text-white flex items-center gap-2.5">
              <UsersIcon className="w-4 h-4 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-mono opacity-85 tracking-wider">
                  {preview.whenHeader}
                </div>
                <div className="text-[15px] font-semibold mt-0.5 tracking-tight">
                  {preview.timeRange}
                </div>
              </div>
            </div>

            <div className="bg-card rounded-[6px] border border-ink-200 shadow-sm p-4 space-y-3">
              <GroupPreviewRow
                icon={<CalendarIcon className="w-4 h-4" />}
                label="Título"
                value={watchedTitle || undefined}
                placeholder="Novo grupo"
              />
              <GroupPreviewRow
                icon={<UsersIcon className="w-4 h-4" />}
                label="Pacientes"
                value={
                  selectedPatients.length > 0
                    ? `${selectedPatients.length} ${
                        selectedPatients.length === 1 ? "paciente" : "pacientes"
                      }`
                    : undefined
                }
                placeholder="Nenhum selecionado"
              />
              <GroupPreviewRow
                icon={<UserIcon className="w-4 h-4" />}
                label="Profissional"
                value={preview.primaryProfessional?.name}
                placeholder="—"
              />
              <GroupPreviewRow
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
              <GroupPreviewRow
                icon={<ClockIcon className="w-4 h-4" />}
                label="Duração"
                value={preview.durationLabel}
              />
              <GroupPreviewRow
                icon={<RefreshCwIcon className="w-4 h-4" />}
                label="Recorrência"
                value={preview.recurrenceSummary}
              />
              {additionalProfessionalIds.length > 0 && (
                <GroupPreviewRow
                  icon={<UsersIcon className="w-4 h-4" />}
                  label="Equipe"
                  value={`+${additionalProfessionalIds.length}`}
                />
              )}
            </div>

            {/* Names of selected patients */}
            {selectedPatients.length > 0 && (
              <div>
                <GroupSidebarLabel>Participantes</GroupSidebarLabel>
                <ul className="mt-2 space-y-1">
                  {selectedPatients.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 text-[12px] text-ink-700 truncate"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isRecurring && preview.sessionCount > 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-[4px] bg-brand-50 border border-brand-100 text-[12px] text-brand-800 leading-[1.45]">
                <InfoIcon className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
                <span>
                  Serão criadas{" "}
                  <strong className="font-semibold">~{preview.sessionCount} sessões</strong> nos
                  próximos 6 meses.
                </span>
              </div>
            )}

            <div className="mt-auto">
              <GroupSidebarLabel>Disponibilidade</GroupSidebarLabel>
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

        {/* Footer */}
        <div className="border-t border-ink-200 bg-ink-50 px-4 md:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[12px] text-ink-500">
            <InfoIcon className="w-3.5 h-3.5" />
            <span>
              {selectedPatients.length < 2
                ? "Selecione ao menos 2 pacientes"
                : `${selectedPatients.length} pacientes selecionados`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedPatients.length < 2}
              className="h-10 px-4 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              <UsersIcon className="w-4 h-4" />
              {isSubmitting
                ? "Criando..."
                : isRecurring
                  ? "Criar grupo"
                  : "Criar sessão"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}

function GroupSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
      <span>{children}</span>
      <span className="flex-1 h-px bg-ink-200" />
    </div>
  )
}

function GroupSidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
      {children}
    </div>
  )
}

function GroupPreviewRow({
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
