import { useState, useCallback } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { toDateString, toLocalDateTime } from "../lib/utils"
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

export function useAppointmentEdit({
  appointmentDuration,
  onSuccess,
}: UseAppointmentEditParams): UseAppointmentEditReturn {
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [editAdditionalProfIds, setEditAdditionalProfIds] = useState<string[]>([])

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
      const scheduledDate = new Date(appointment.scheduledAt)
      const endDate = new Date(appointment.endAt)
      const durationMinutes = Math.round((endDate.getTime() - scheduledDate.getTime()) / 60000)

      form.reset({
        date: toDateString(scheduledDate),
        startTime: `${scheduledDate.getHours().toString().padStart(2, "0")}:${scheduledDate.getMinutes().toString().padStart(2, "0")}`,
        duration: durationMinutes,
        modality: appointment.modality as "ONLINE" | "PRESENCIAL",
        notes: appointment.notes || "",
        price: appointment.price ? parseFloat(appointment.price) : null,
      })
      setIsEditSheetOpen(true)
    },
    [form]
  )

  const closeEditSheet = useCallback(() => {
    setIsEditSheetOpen(false)
    setSelectedAppointment(null)
  }, [])

  const onSubmit = useCallback(
    async (data: EditAppointmentFormData) => {
      if (!selectedAppointment) return

      // Clear any previous API error
      setApiError(null)

      setIsUpdating(true)
      try {
        const scheduledAt = toLocalDateTime(data.date, data.startTime)

        const durationMinutes = data.duration || appointmentDuration
        const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60000)

        const result = await updateAppointment(selectedAppointment.id, {
          scheduledAt: scheduledAt.toISOString(),
          endAt: endAt.toISOString(),
          modality: data.modality,
          notes: data.notes || null,
          price: data.price !== undefined && data.price !== "" ? Number(data.price) : null,
          additionalProfessionalIds: editAdditionalProfIds,
        })

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
