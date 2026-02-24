import { useState, useCallback } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { toDisplayDateFromDate, toIsoDate } from "../lib/utils"
import { appointmentSchema, AppointmentFormData, Patient, RecurrenceType, RecurrenceEndType, Professional } from "../lib/types"
import { createAppointment, CreateAppointmentData } from "../services"
import { AppointmentType } from "../components/RecurrenceOptions"

export interface UseAppointmentCreateParams {
  selectedDate: Date
  isAdmin: boolean
  selectedProfessionalId: string
  professionals: Professional[]
  onSuccess: () => void
}

export interface UseAppointmentCreateReturn {
  // Sheet state
  isCreateSheetOpen: boolean
  openCreateSheet: (slotTime?: string, overrides?: { date?: Date; appointmentType?: AppointmentType }) => void
  closeCreateSheet: () => void

  // Form
  form: UseFormReturn<AppointmentFormData>

  // Patient selection
  patientSearch: string
  setPatientSearch: (search: string) => void
  selectedPatient: Patient | null
  handleSelectPatient: (patient: Patient) => void
  handleClearPatient: () => void

  // Professional selection (for admin)
  createProfessionalId: string
  setCreateProfessionalId: (id: string) => void
  isProfessionalLocked: boolean

  // Appointment type state (replaces isRecurrenceEnabled)
  appointmentType: AppointmentType
  setAppointmentType: (type: AppointmentType) => void
  recurrenceEndType: RecurrenceEndType
  setRecurrenceEndType: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  setRecurrenceEndDate: (date: string) => void
  recurrenceOccurrences: number
  setRecurrenceOccurrences: (occurrences: number) => void

  // Additional professionals (multi-professional support)
  additionalProfessionalIds: string[]
  setAdditionalProfessionalIds: (ids: string[]) => void

  // API error (shown inline)
  apiError: string | null
  clearApiError: () => void

  // Submission
  isSaving: boolean
  onSubmit: (data: AppointmentFormData) => Promise<void>
}

export function useAppointmentCreate({
  selectedDate,
  isAdmin,
  selectedProfessionalId,
  professionals,
  onSuccess,
}: UseAppointmentCreateParams): UseAppointmentCreateReturn {
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Professional selection for admin (when no professional is pre-selected)
  const [createProfessionalId, setCreateProfessionalId] = useState("")
  const isProfessionalLocked = !!selectedProfessionalId

  const clearApiError = useCallback(() => setApiError(null), [])

  // Appointment type state - WEEKLY by default (psychology clinic norm)
  // INDEFINITE end type by default - appointments continue until explicitly stopped
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("WEEKLY")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("INDEFINITE")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(10)
  const [additionalProfessionalIds, setAdditionalProfessionalIds] = useState<string[]>([])

  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      modality: "PRESENCIAL",
    },
  })

  const openCreateSheet = useCallback(
    (slotTime?: string, overrides?: { date?: Date; appointmentType?: AppointmentType }) => {
      const effectiveDate = overrides?.date || selectedDate
      setSelectedPatient(null)
      setPatientSearch("")
      setCreateProfessionalId(selectedProfessionalId || "")
      setApiError(null)
      // Default to WEEKLY recurring appointment with no end date, unless overridden
      setAppointmentType(overrides?.appointmentType || "WEEKLY")
      setRecurrenceEndType("INDEFINITE")
      setRecurrenceEndDate("")
      setRecurrenceOccurrences(10)
      setAdditionalProfessionalIds([])
      form.reset({
        patientId: "",
        date: toDisplayDateFromDate(effectiveDate),
        startTime: slotTime || "",
        modality: "PRESENCIAL",
        notes: "",
      })
      setIsCreateSheetOpen(true)
    },
    [selectedDate, selectedProfessionalId, form]
  )

  const closeCreateSheet = useCallback(() => {
    setIsCreateSheetOpen(false)
    setSelectedPatient(null)
    setPatientSearch("")
    setCreateProfessionalId("")
    setAppointmentType("WEEKLY")
  }, [])

  const handleSelectPatient = useCallback(
    (patient: Patient) => {
      setSelectedPatient(patient)
      form.setValue("patientId", patient.id)
      setPatientSearch(patient.name)
    },
    [form]
  )

  const handleClearPatient = useCallback(() => {
    setSelectedPatient(null)
    form.setValue("patientId", "")
  }, [form])

  const onSubmit = useCallback(
    async (data: AppointmentFormData) => {
      // Clear any previous API error
      setApiError(null)

      // For admin, require a professional to be selected
      const effectiveProfessionalId = selectedProfessionalId || createProfessionalId
      if (isAdmin && !effectiveProfessionalId) {
        setApiError("Selecione um profissional")
        return
      }

      setIsSaving(true)
      try {
        const body: CreateAppointmentData = {
          patientId: data.patientId,
          date: toIsoDate(data.date),
          startTime: data.startTime,
          modality: data.modality,
          notes: data.notes || null,
        }

        if (isAdmin && effectiveProfessionalId) {
          body.professionalProfileId = effectiveProfessionalId
        }
        if (data.duration) {
          body.duration = data.duration
        }

        // Only add recurrence if not SINGLE
        const isRecurring = appointmentType !== "SINGLE"
        if (isRecurring) {
          body.recurrence = {
            recurrenceType: appointmentType as RecurrenceType,
            recurrenceEndType,
            ...(recurrenceEndType === "BY_DATE" && { endDate: toIsoDate(recurrenceEndDate) }),
            ...(recurrenceEndType === "BY_OCCURRENCES" && { occurrences: recurrenceOccurrences }),
          }
        }

        if (additionalProfessionalIds.length > 0) {
          body.additionalProfessionalIds = additionalProfessionalIds
        }

        const result = await createAppointment(body)

        if (result.error) {
          if (result.occurrenceIndex) {
            setApiError(`${result.error} (Ocorrencia ${result.occurrenceIndex})`)
          } else {
            setApiError(result.error)
          }
          return
        }

        if (isRecurring && result.totalOccurrences) {
          toast.success(`${result.totalOccurrences} agendamentos criados com sucesso`)
        } else {
          toast.success("Agendamento criado com sucesso")
        }

        closeCreateSheet()
        onSuccess()
      } catch {
        setApiError("Erro ao criar agendamento")
      } finally {
        setIsSaving(false)
      }
    },
    [
      isAdmin,
      selectedProfessionalId,
      createProfessionalId,
      appointmentType,
      recurrenceEndType,
      recurrenceEndDate,
      recurrenceOccurrences,
      additionalProfessionalIds,
      closeCreateSheet,
      onSuccess,
    ]
  )

  return {
    isCreateSheetOpen,
    openCreateSheet,
    closeCreateSheet,
    form,
    patientSearch,
    setPatientSearch,
    selectedPatient,
    handleSelectPatient,
    handleClearPatient,
    createProfessionalId,
    setCreateProfessionalId,
    isProfessionalLocked,
    appointmentType,
    setAppointmentType,
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
