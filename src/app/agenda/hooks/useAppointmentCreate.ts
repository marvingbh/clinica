import { useState, useCallback } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { toDisplayDateFromDate, toIsoDate } from "../lib/utils"
import { appointmentSchema, AppointmentFormData, Patient, RecurrenceType, RecurrenceEndType, Professional } from "../lib/types"
import { createAppointment, CreateAppointmentData } from "../services"

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
  openCreateSheet: (slotTime?: string) => void
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

  // Recurrence state
  isRecurrenceEnabled: boolean
  setIsRecurrenceEnabled: (enabled: boolean) => void
  recurrenceType: RecurrenceType
  setRecurrenceType: (type: RecurrenceType) => void
  recurrenceEndType: RecurrenceEndType
  setRecurrenceEndType: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  setRecurrenceEndDate: (date: string) => void
  recurrenceOccurrences: number
  setRecurrenceOccurrences: (occurrences: number) => void

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

  // Professional selection for admin (when no professional is pre-selected)
  const [createProfessionalId, setCreateProfessionalId] = useState("")
  const isProfessionalLocked = !!selectedProfessionalId

  // Recurrence state
  const [isRecurrenceEnabled, setIsRecurrenceEnabled] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("WEEKLY")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("BY_OCCURRENCES")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(10)

  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      modality: "PRESENCIAL",
    },
  })

  const openCreateSheet = useCallback(
    (slotTime?: string) => {
      setSelectedPatient(null)
      setPatientSearch("")
      setCreateProfessionalId(selectedProfessionalId || "")
      setIsRecurrenceEnabled(false)
      setRecurrenceType("WEEKLY")
      setRecurrenceEndType("BY_OCCURRENCES")
      setRecurrenceEndDate("")
      setRecurrenceOccurrences(10)
      form.reset({
        patientId: "",
        date: toDisplayDateFromDate(selectedDate),
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
    setIsRecurrenceEnabled(false)
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
      // For admin, require a professional to be selected
      const effectiveProfessionalId = selectedProfessionalId || createProfessionalId
      if (isAdmin && !effectiveProfessionalId) {
        toast.error("Selecione um profissional")
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
        if (isRecurrenceEnabled) {
          body.recurrence = {
            recurrenceType,
            recurrenceEndType,
            ...(recurrenceEndType === "BY_DATE" && { endDate: recurrenceEndDate }),
            ...(recurrenceEndType === "BY_OCCURRENCES" && { occurrences: recurrenceOccurrences }),
          }
        }

        const result = await createAppointment(body)

        if (result.error) {
          if (result.occurrenceIndex) {
            toast.error(`${result.error} (Ocorrencia ${result.occurrenceIndex})`)
          } else {
            toast.error(result.error)
          }
          return
        }

        if (isRecurrenceEnabled && result.totalOccurrences) {
          toast.success(`${result.totalOccurrences} agendamentos criados com sucesso`)
        } else {
          toast.success("Agendamento criado com sucesso")
        }

        closeCreateSheet()
        onSuccess()
      } catch {
        toast.error("Erro ao criar agendamento")
      } finally {
        setIsSaving(false)
      }
    },
    [
      isAdmin,
      selectedProfessionalId,
      createProfessionalId,
      isRecurrenceEnabled,
      recurrenceType,
      recurrenceEndType,
      recurrenceEndDate,
      recurrenceOccurrences,
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
    isRecurrenceEnabled,
    setIsRecurrenceEnabled,
    recurrenceType,
    setRecurrenceType,
    recurrenceEndType,
    setRecurrenceEndType,
    recurrenceEndDate,
    setRecurrenceEndDate,
    recurrenceOccurrences,
    setRecurrenceOccurrences,
    isSaving,
    onSubmit,
  }
}
