import { useState, useCallback } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { toDateString, toIsoDate } from "../lib/utils"
import { calendarEntrySchema, CalendarEntryFormData, CalendarEntryType, RecurrenceEndType, Professional } from "../lib/types"
import { createCalendarEntry, CreateCalendarEntryData } from "../services"
import { DEFAULT_ENTRY_DURATIONS } from "../lib/constants"

// Only non-CONSULTA types
type EntryType = Exclude<CalendarEntryType, "CONSULTA">

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
  recurrenceEndType: RecurrenceEndType
  setRecurrenceEndType: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  setRecurrenceEndDate: (date: string) => void
  recurrenceOccurrences: number
  setRecurrenceOccurrences: (occurrences: number) => void
  additionalProfessionalIds: string[]
  setAdditionalProfessionalIds: (ids: string[]) => void
  apiError: string | null
  clearApiError: () => void
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
  const [createProfessionalId, setCreateProfessionalId] = useState("")
  const isProfessionalLocked = !!selectedProfessionalId

  const clearApiError = useCallback(() => setApiError(null), [])

  // Recurrence state - SINGLE by default for calendar entries
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("INDEFINITE")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(10)
  const [additionalProfessionalIds, setAdditionalProfessionalIds] = useState<string[]>([])

  const form = useForm<CalendarEntryFormData>({
    resolver: zodResolver(calendarEntrySchema),
  })

  const openSheet = useCallback(
    (type: EntryType, slotTime?: string) => {
      setEntryType(type)
      setApiError(null)
      setCreateProfessionalId(selectedProfessionalId || "")
      setIsRecurring(false)
      setRecurrenceEndType("INDEFINITE")
      setRecurrenceEndDate("")
      setRecurrenceOccurrences(10)
      setAdditionalProfessionalIds([])
      form.reset({
        title: "",
        date: toDateString(selectedDate),
        startTime: slotTime || "",
        duration: DEFAULT_ENTRY_DURATIONS[type] || 60,
        notes: "",
      })
      setIsSheetOpen(true)
    },
    [selectedDate, selectedProfessionalId, form]
  )

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false)
  }, [])

  const onSubmit = useCallback(
    async (data: CalendarEntryFormData) => {
      setApiError(null)

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

        if (entryType === "REUNIAO" && additionalProfessionalIds.length > 0) {
          body.additionalProfessionalIds = additionalProfessionalIds
        }

        if (isRecurring) {
          body.recurrence = {
            recurrenceType: "WEEKLY",
            recurrenceEndType,
            ...(recurrenceEndType === "BY_DATE" && { endDate: recurrenceEndDate }),
            ...(recurrenceEndType === "BY_OCCURRENCES" && { occurrences: recurrenceOccurrences }),
          }
        }

        const result = await createCalendarEntry(body)

        if (result.error) {
          if (result.occurrenceIndex) {
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
      recurrenceEndType,
      recurrenceEndDate,
      recurrenceOccurrences,
      additionalProfessionalIds,
      closeSheet,
      onSuccess,
    ]
  )

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
    recurrenceEndType,
    setRecurrenceEndType,
    recurrenceEndDate,
    setRecurrenceEndDate,
    recurrenceOccurrences,
    setRecurrenceOccurrences,
    additionalProfessionalIds,
    setAdditionalProfessionalIds,
    apiError,
    clearApiError,
    isSaving,
    onSubmit,
  }
}
