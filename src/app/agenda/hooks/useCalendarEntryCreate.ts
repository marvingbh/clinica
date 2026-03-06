import { useState, useCallback } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { toDisplayDateFromDate, toIsoDate } from "../lib/utils"
import { calendarEntrySchema, CalendarEntryFormData, CalendarEntryType, RecurrenceEndType, Professional, Patient } from "../lib/types"
import { createCalendarEntry, CreateCalendarEntryData } from "../services"
import { DEFAULT_ENTRY_DURATIONS } from "../lib/constants"

// Only non-CONSULTA types
type EntryType = Exclude<CalendarEntryType, "CONSULTA">
type CalendarEntryRecurrenceType = "WEEKLY" | "BIWEEKLY"

export interface UseCalendarEntryCreateParams {
  selectedDate: Date
  isAdmin: boolean
  selectedProfessionalId: string
  professionals: Professional[]
  onSuccess: () => void
}

export interface UseCalendarEntryCreateReturn {
  isSheetOpen: boolean
  openSheet: (entryType: EntryType, slotTime?: string) => void
  closeSheet: () => void
  entryType: EntryType
  form: UseFormReturn<CalendarEntryFormData>
  createProfessionalId: string
  setCreateProfessionalId: (id: string) => void
  isProfessionalLocked: boolean
  isRecurring: boolean
  setIsRecurring: (value: boolean) => void
  recurrenceType: CalendarEntryRecurrenceType
  setRecurrenceType: (type: CalendarEntryRecurrenceType) => void
  recurrenceEndType: RecurrenceEndType
  setRecurrenceEndType: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  setRecurrenceEndDate: (date: string) => void
  recurrenceOccurrences: number
  setRecurrenceOccurrences: (occurrences: number) => void
  additionalProfessionalIds: string[]
  setAdditionalProfessionalIds: (ids: string[]) => void
  // Patient (optional, for REUNIAO)
  selectedPatient: Patient | null
  setSelectedPatient: (patient: Patient | null) => void
  patientSearch: string
  setPatientSearch: (value: string) => void
  apiError: string | null
  clearApiError: () => void
  availabilityWarning: string | null
  onConfirmAvailabilityOverride: () => void
  clearAvailabilityWarning: () => void
  isSaving: boolean
  onSubmit: (data: CalendarEntryFormData) => Promise<void>
}

export function useCalendarEntryCreate({
  selectedDate,
  isAdmin,
  selectedProfessionalId,
  professionals,
  onSuccess,
}: UseCalendarEntryCreateParams): UseCalendarEntryCreateReturn {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [entryType, setEntryType] = useState<EntryType>("TAREFA")
  const [isSaving, setIsSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null)
  const [pendingFormData, setPendingFormData] = useState<CalendarEntryFormData | null>(null)
  const [createProfessionalId, setCreateProfessionalId] = useState("")
  const isProfessionalLocked = !!selectedProfessionalId

  const clearApiError = useCallback(() => setApiError(null), [])
  const clearAvailabilityWarning = useCallback(() => {
    setAvailabilityWarning(null)
    setPendingFormData(null)
  }, [])

  // Recurrence state - SINGLE by default for calendar entries
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<CalendarEntryRecurrenceType>("WEEKLY")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("INDEFINITE")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(10)
  const [additionalProfessionalIds, setAdditionalProfessionalIds] = useState<string[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [patientSearch, setPatientSearch] = useState("")

  const form = useForm<CalendarEntryFormData>({
    resolver: zodResolver(calendarEntrySchema),
  })

  const openSheet = useCallback(
    (type: EntryType, slotTime?: string) => {
      setEntryType(type)
      setApiError(null)
      setCreateProfessionalId(selectedProfessionalId || "")
      setIsRecurring(false)
      setRecurrenceType("WEEKLY")
      setRecurrenceEndType("INDEFINITE")
      setRecurrenceEndDate("")
      setRecurrenceOccurrences(10)
      setAdditionalProfessionalIds([])
      setSelectedPatient(null)
      setPatientSearch("")

      // Non-blocking types (LEMBRETE, NOTA) use fixed defaults.
      // Time-blocking types (TAREFA, REUNIAO) use the professional's configured duration.
      const profDuration = professionals.find(
        p => p.professionalProfile?.id === selectedProfessionalId
      )?.professionalProfile?.appointmentDuration
      const duration = DEFAULT_ENTRY_DURATIONS[type] ?? profDuration ?? 60

      form.reset({
        title: "",
        date: toDisplayDateFromDate(selectedDate),
        startTime: slotTime || "",
        duration,
        notes: "",
      })
      setIsSheetOpen(true)
    },
    [selectedDate, selectedProfessionalId, professionals, form]
  )

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false)
  }, [])

  const submitEntry = useCallback(
    async (data: CalendarEntryFormData, skipAvailabilityCheck = false) => {
      setApiError(null)
      setAvailabilityWarning(null)
      setPendingFormData(null)

      const effectiveProfessionalId = selectedProfessionalId || createProfessionalId
      if (isAdmin && !effectiveProfessionalId) {
        setApiError("Selecione um profissional")
        return
      }

      setIsSaving(true)
      try {
        const body: CreateCalendarEntryData = {
          type: entryType,
          title: data.title,
          date: toIsoDate(data.date),
          startTime: data.startTime,
          notes: data.notes || null,
        }

        if (data.duration) {
          body.duration = data.duration
        }

        if (isAdmin && effectiveProfessionalId) {
          body.professionalProfileId = effectiveProfessionalId
        }

        if (entryType === "REUNIAO") {
          if (additionalProfessionalIds.length > 0) {
            body.additionalProfessionalIds = additionalProfessionalIds
          }
          if (selectedPatient) {
            body.patientId = selectedPatient.id
          }
        }

        if (isRecurring) {
          body.recurrence = {
            recurrenceType,
            recurrenceEndType,
            ...(recurrenceEndType === "BY_DATE" && { endDate: toIsoDate(recurrenceEndDate) }),
            ...(recurrenceEndType === "BY_OCCURRENCES" && { occurrences: recurrenceOccurrences }),
          }
        }

        if (skipAvailabilityCheck) {
          body.skipAvailabilityCheck = true
        }

        const result = await createCalendarEntry(body)

        if (result.error) {
          if (result.availabilityWarning) {
            const msg = result.occurrenceIndex
              ? `${result.error} (Ocorrencia ${result.occurrenceIndex})`
              : result.error
            setAvailabilityWarning(msg)
            setPendingFormData(data)
          } else if (result.occurrenceIndex) {
            setApiError(`${result.error} (Ocorrencia ${result.occurrenceIndex})`)
          } else {
            setApiError(result.error)
          }
          return
        }

        if (isRecurring && result.totalOccurrences) {
          toast.success(`${result.totalOccurrences} entradas criadas com sucesso`)
        } else {
          toast.success("Entrada criada com sucesso")
        }

        closeSheet()
        onSuccess()
      } catch {
        setApiError("Erro ao criar entrada")
      } finally {
        setIsSaving(false)
      }
    },
    [
      isAdmin,
      selectedProfessionalId,
      createProfessionalId,
      entryType,
      isRecurring,
      recurrenceType,
      recurrenceEndType,
      recurrenceEndDate,
      recurrenceOccurrences,
      additionalProfessionalIds,
      selectedPatient,
      closeSheet,
      onSuccess,
    ]
  )

  const onSubmit = useCallback(
    async (data: CalendarEntryFormData) => submitEntry(data, false),
    [submitEntry]
  )

  const onConfirmAvailabilityOverride = useCallback(() => {
    if (pendingFormData) {
      submitEntry(pendingFormData, true)
    }
  }, [pendingFormData, submitEntry])

  return {
    isSheetOpen,
    openSheet,
    closeSheet,
    entryType,
    form,
    createProfessionalId,
    setCreateProfessionalId,
    isProfessionalLocked,
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
    setSelectedPatient,
    patientSearch,
    setPatientSearch,
    apiError,
    clearApiError,
    availabilityWarning,
    onConfirmAvailabilityOverride,
    clearAvailabilityWarning,
    isSaving,
    onSubmit,
  }
}
