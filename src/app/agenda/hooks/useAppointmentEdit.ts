import { useState, useCallback } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { toDisplayDateFromDate, toIsoDate } from "../lib/utils"
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

  const form = useForm<EditAppointmentFormData>({
    resolver: zodResolver(editAppointmentSchema),
  })

  const openEditSheet = useCallback(
    (appointment: Appointment) => {
      setSelectedAppointment(appointment)
      const scheduledDate = new Date(appointment.scheduledAt)
      const endDate = new Date(appointment.endAt)
      const durationMinutes = Math.round((endDate.getTime() - scheduledDate.getTime()) / 60000)

      form.reset({
        date: toDisplayDateFromDate(scheduledDate),
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

      setIsUpdating(true)
      try {
        const [hours, minutes] = data.startTime.split(":").map(Number)
        const isoDate = toIsoDate(data.date)
        const scheduledAt = new Date(isoDate + "T12:00:00")
        scheduledAt.setHours(hours, minutes, 0, 0)

        const durationMinutes = data.duration || appointmentDuration
        const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60000)

        const result = await updateAppointment(selectedAppointment.id, {
          scheduledAt: scheduledAt.toISOString(),
          endAt: endAt.toISOString(),
          modality: data.modality,
          notes: data.notes || null,
          price: data.price !== undefined && data.price !== "" ? Number(data.price) : null,
        })

        if (result.error) {
          toast.error(result.error)
          return
        }

        toast.success("Agendamento atualizado com sucesso")
        closeEditSheet()
        onSuccess()
      } catch {
        toast.error("Erro ao atualizar agendamento")
      } finally {
        setIsUpdating(false)
      }
    },
    [selectedAppointment, appointmentDuration, closeEditSheet, onSuccess]
  )

  return {
    isEditSheetOpen,
    openEditSheet,
    closeEditSheet,
    selectedAppointment,
    setSelectedAppointment,
    form,
    isUpdating,
    onSubmit,
  }
}
