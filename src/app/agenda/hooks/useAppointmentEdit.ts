import { useState, useCallback, useRef } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { toDisplayDateFromDate, toLocalDateTime } from "../lib/utils"
import { editAppointmentSchema, EditAppointmentFormData, Appointment } from "../lib/types"
import { updateAppointment } from "../services"

export interface UseAppointmentEditParams {
  appointmentDuration: number
  onSuccess: () => void
}

export interface UseAppointmentEditReturn {
  // Sheet state
  isEditSheetOpen: boolean
  openEditSheet: (appointment: Appointment) => void
  closeEditSheet: () => void

  // Selected appointment
  selectedAppointment: Appointment | null
  setSelectedAppointment: (appointment: Appointment | null) => void

  // Form
  form: UseFormReturn<EditAppointmentFormData>

  // Additional professionals
  editAdditionalProfIds: string[]
  setEditAdditionalProfIds: (ids: string[]) => void

  // API error (shown inline)
  apiError: string | null
  clearApiError: () => void

  // Submission
  isUpdating: boolean
  onSubmit: (data: EditAppointmentFormData) => Promise<void>
}

function computeFormValues(appointment: Appointment): EditAppointmentFormData {
  const scheduledDate = new Date(appointment.scheduledAt)
  const endDate = new Date(appointment.endAt)
  const durationMinutes = Math.round((endDate.getTime() - scheduledDate.getTime()) / 60000)
  return {
    date: toDisplayDateFromDate(scheduledDate),
    startTime: `${scheduledDate.getHours().toString().padStart(2, "0")}:${scheduledDate.getMinutes().toString().padStart(2, "0")}`,
    duration: durationMinutes,
    modality: appointment.modality as "ONLINE" | "PRESENCIAL",
    notes: appointment.notes || "",
    price: appointment.price ? parseFloat(appointment.price) : null,
  }
}

export function useAppointmentEdit({
  appointmentDuration,
  onSuccess,
}: UseAppointmentEditParams): UseAppointmentEditReturn {
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [editAdditionalProfIds, setEditAdditionalProfIds] = useState<string[]>([])
  // Store original date/time so we only send them if actually changed
  const originalValuesRef = useRef<{ date: string; startTime: string; duration: number } | null>(null)

  const clearApiError = useCallback(() => setApiError(null), [])

  const form = useForm<EditAppointmentFormData>({
    resolver: zodResolver(editAppointmentSchema),
  })

  const openEditSheet = useCallback(
    (appointment: Appointment) => {
      setSelectedAppointment(appointment)
      setApiError(null)
      setEditAdditionalProfIds(
        appointment.additionalProfessionals?.map(ap => ap.professionalProfile.id) || []
      )
      const values = computeFormValues(appointment)
      originalValuesRef.current = { date: values.date, startTime: values.startTime, duration: values.duration || 0 }
      form.reset(values)
      setIsEditSheetOpen(true)
    },
    [form]
  )

  // Portal workaround: re-syncs form after Sheet portal mounts (depends on isEditSheetOpen)
   
  useEffect(() => {
    if (isEditSheetOpen && selectedAppointment) {
      const values = computeFormValues(selectedAppointment)
      form.reset(values)
    }
    // Only run when the sheet opens (not on every selectedAppointment change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditSheetOpen])

  const closeEditSheet = useCallback(() => {
    setIsEditSheetOpen(false)
    setSelectedAppointment(null)
    originalValuesRef.current = null
  }, [])

  const onSubmit = useCallback(
    async (data: EditAppointmentFormData) => {
      if (!selectedAppointment) return

      // Clear any previous API error
      setApiError(null)

      setIsUpdating(true)
      try {
        // Only include scheduledAt/endAt if the user actually changed date, time, or duration
        const orig = originalValuesRef.current
        const timeChanged = !orig
          || data.date !== orig.date
          || data.startTime !== orig.startTime
          || (data.duration || 0) !== orig.duration

        const updateData: Record<string, unknown> = {
          modality: data.modality,
          notes: data.notes || null,
          price: data.price != null && data.price !== "" && !isNaN(Number(data.price)) ? Number(data.price) : null,
          additionalProfessionalIds: editAdditionalProfIds,
        }

        if (timeChanged) {
          const scheduledAt = toLocalDateTime(data.date, data.startTime)
          const durationMinutes = data.duration || appointmentDuration
          const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60000)
          updateData.scheduledAt = scheduledAt.toISOString()
          updateData.endAt = endAt.toISOString()
        }

        const result = await updateAppointment(selectedAppointment.id, updateData)

        if (result.error) {
          setApiError(result.error)
          return
        }

        toast.success("Agendamento atualizado com sucesso")
        closeEditSheet()
        onSuccess()
      } catch {
        setApiError("Erro ao atualizar agendamento")
      } finally {
        setIsUpdating(false)
      }
    },
    [selectedAppointment, appointmentDuration, editAdditionalProfIds, closeEditSheet, onSuccess]
  )

  return {
    isEditSheetOpen,
    openEditSheet,
    closeEditSheet,
    selectedAppointment,
    setSelectedAppointment,
    form,
    editAdditionalProfIds,
    setEditAdditionalProfIds,
    apiError,
    clearApiError,
    isUpdating,
    onSubmit,
  }
}
