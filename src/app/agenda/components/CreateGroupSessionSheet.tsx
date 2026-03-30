"use client"

import { useState, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { BuildingIcon, VideoIcon, XIcon } from "@/shared/components/ui"
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

  const startTime = watch("startTime")
  const duration = watch("duration") || appointmentDuration

  const handleAddPatient = useCallback((patient: Patient) => {
    setSelectedPatients(prev => {
      if (prev.some(p => p.id === patient.id)) return prev
      return [...prev, patient]
    })
  }, [])

  const handleRemovePatient = useCallback((patientId: string) => {
    setSelectedPatients(prev => prev.filter(p => p.id !== patientId))
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
      patientIds: selectedPatients.map(p => p.id),
      title: data.title,
      date: isoDate,
      startTime: data.startTime,
      duration: data.duration,
      modality: data.modality,
      notes: data.notes,
      professionalProfileId: createProfessionalId || undefined,
      additionalProfessionalIds: additionalProfessionalIds.length > 0 ? additionalProfessionalIds : undefined,
      skipAvailabilityCheck: skipAvailability,
    })

    setIsSubmitting(false)

    if (result.error) {
      if (result.availabilityWarning) { setAvailabilityWarning(result.error) }
      else { setApiError(result.error) }
      return
    }

    toast.success(`Sessão em grupo criada com ${selectedPatients.length} pacientes`)
    resetAndClose()
  }

  const submitRecurringGroup = async (data: GroupSessionFormData, isoDate: string) => {
    try {
      const dateObj = new Date(isoDate + "T12:00:00")

      // 1. Create TherapyGroup
      const groupResult = await createTherapyGroup({
        name: data.title,
        dayOfWeek: dateObj.getDay(),
        startTime: data.startTime,
        duration: data.duration || appointmentDuration,
        recurrenceType,
        professionalProfileId: createProfessionalId || undefined,
        additionalProfessionalIds: additionalProfessionalIds.length > 0 ? additionalProfessionalIds : undefined,
      })
      if (groupResult.error || !groupResult.groupId) {
        setApiError(groupResult.error || "Erro ao criar grupo"); setIsSubmitting(false); return
      }

      // 2. Add members
      for (const patient of selectedPatients) {
        const result = await addGroupMember(groupResult.groupId, patient.id, isoDate)
        if (result.error) {
          setApiError(`Erro ao adicionar ${patient.name}: ${result.error}`); setIsSubmitting(false); return
        }
      }

      // 3. Generate sessions (6 months)
      const endDate = new Date(dateObj)
      endDate.setMonth(endDate.getMonth() + 6)
      const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`

      const sessionsResult = await generateGroupSessions(groupResult.groupId, isoDate, endDateStr)
      if (sessionsResult.error) {
        setApiError(sessionsResult.error); setIsSubmitting(false); return
      }

      toast.success(`Grupo "${data.title}" criado com ${sessionsResult.sessionsCreated} sessões`)
      resetAndClose()
    } catch {
      setApiError("Erro ao criar grupo recorrente"); setIsSubmitting(false)
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

  return (
    <Sheet isOpen={isOpen} onClose={handleClose} title="Nova Sessão em Grupo">
      <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-4 space-y-4">
        {/* Patients multi-select */}
        <MultiPatientSearch
          selectedPatients={selectedPatients}
          onAddPatient={handleAddPatient}
          onRemovePatient={handleRemovePatient}
          error={selectedPatients.length > 0 && selectedPatients.length < 2 ? "Selecione pelo menos 2 pacientes" : undefined}
        />

        {/* Title */}
        <div>
          <label htmlFor="gs-title" className="block text-sm font-medium text-foreground mb-1.5">
            Título *
          </label>
          <input
            id="gs-title"
            type="text"
            {...register("title")}
            placeholder="Ex: Grupo de ansiedade"
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
          />
          {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
        </div>

        {/* Recurrence toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-input bg-muted/30">
          <div>
            <p className="text-sm font-medium text-foreground">Grupo recorrente</p>
            <p className="text-xs text-muted-foreground">Cria sessões automaticamente</p>
          </div>
          <button
            type="button"
            onClick={() => setIsRecurring(!isRecurring)}
            className={`relative w-11 h-6 rounded-full transition-colors ${isRecurring ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isRecurring ? "translate-x-[22px]" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Recurrence type */}
        {isRecurring && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Frequência</label>
            <div className="grid grid-cols-3 gap-2">
              {([["WEEKLY", "Semanal"], ["BIWEEKLY", "Quinzenal"], ["MONTHLY", "Mensal"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRecurrenceType(value)}
                  className={`h-10 rounded-xl border text-sm font-medium transition-colors ${
                    recurrenceType === value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="gs-date" className="block text-sm font-medium text-foreground mb-1.5">Data *</label>
            <DateInput id="gs-date" {...register("date")} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
            {errors.date && <p className="text-xs text-destructive mt-1">{errors.date.message}</p>}
          </div>
          <div>
            <label htmlFor="gs-startTime" className="block text-sm font-medium text-foreground mb-1.5">Horário *</label>
            <TimeInput id="gs-startTime" placeholder="HH:MM" {...register("startTime")} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
            {errors.startTime && <p className="text-xs text-destructive mt-1">{errors.startTime.message}</p>}
          </div>
        </div>

        {/* Duration & End time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Duração (min)
            </label>
            <input
              type="number"
              {...register("duration", { valueAsNumber: true })}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Término
            </label>
            <input
              type="text"
              readOnly
              value={startTime && timeRegex.test(startTime) ? calculateEndTime(startTime, duration) || "" : ""}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-muted/50 text-foreground text-sm"
            />
          </div>
        </div>

        {/* Modality */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Modalidade *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["PRESENCIAL", "ONLINE"] as const).map((mod) => {
              const isSelected = watch("modality") === mod
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setValue("modality", mod)}
                  className={`h-11 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {mod === "PRESENCIAL" ? <BuildingIcon className="w-4 h-4" /> : <VideoIcon className="w-4 h-4" />}
                  {mod === "PRESENCIAL" ? "Presencial" : "Online"}
                </button>
              )
            })}
          </div>
        </div>

        {/* Professional (admin only) */}
        {isAdmin && professionals.length > 1 && !isProfessionalLocked && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Profissional
            </label>
            <select
              value={createProfessionalId}
              onChange={(e) => onCreateProfessionalIdChange(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm"
            >
              {professionals.map(prof => (
                <option key={prof.id} value={prof.professionalProfile?.id || ""}>
                  {prof.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Observações
          </label>
          <textarea
            {...register("notes")}
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm resize-none"
            placeholder="Observações opcionais..."
          />
        </div>

        {/* Errors */}
        {apiError && (
          <InlineAlert variant="error" message={apiError} onDismiss={() => setApiError(null)} />
        )}

        {availabilityWarning && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30 p-3">
              <p className="flex-1 text-sm text-orange-800 dark:text-orange-200">{availabilityWarning}</p>
              <button type="button" onClick={() => setAvailabilityWarning(null)} className="text-orange-400 hover:text-orange-600">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <button type="button" onClick={handleConfirmAvailabilityOverride} disabled={isSubmitting} className="w-full h-10 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 font-medium text-sm hover:bg-orange-200 dark:hover:bg-orange-800/50 disabled:opacity-50 transition-colors">
              Agendar mesmo assim
            </button>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || selectedPatients.length < 2}
          className="w-full h-12 rounded-xl bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Criando..." : isRecurring
            ? `Criar Grupo Recorrente (${selectedPatients.length} pacientes)`
            : `Criar Sessão em Grupo (${selectedPatients.length} pacientes)`}
        </button>
      </form>
    </Sheet>
  )
}
