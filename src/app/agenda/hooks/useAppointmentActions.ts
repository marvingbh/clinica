import { useState, useCallback } from "react"
import { toast } from "sonner"
import type { Appointment } from "../lib/types"
import {
  updateStatus,
  resendConfirmation,
  toggleRecurrenceException,
  deleteAppointment,
} from "../services"

export interface UseAppointmentActionsParams {
  selectedAppointment: Appointment | null
  setSelectedAppointment: (appointment: Appointment | null) => void
  closeEditSheet: () => void
  onSuccess: () => void
}

export interface UseAppointmentActionsReturn {
  // Status updates
  isUpdatingStatus: boolean
  handleUpdateStatus: (newStatus: string, successMessage: string, reason?: string) => Promise<void>

  // Resend confirmation
  isResendingConfirmation: boolean
  handleResendConfirmation: () => Promise<void>

  // Recurrence management
  isManagingException: boolean
  handleToggleException: (action: "skip" | "unskip") => Promise<void>

  // Delete appointment
  isDeleteDialogOpen: boolean
  setIsDeleteDialogOpen: (open: boolean) => void
  isDeletingAppointment: boolean
  handleDeleteAppointment: () => Promise<void>
}

export function useAppointmentActions({
  selectedAppointment,
  setSelectedAppointment,
  closeEditSheet,
  onSuccess,
}: UseAppointmentActionsParams): UseAppointmentActionsReturn {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)
  const [isManagingException, setIsManagingException] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletingAppointment, setIsDeletingAppointment] = useState(false)

  const handleUpdateStatus = useCallback(
    async (newStatus: string, successMessage: string, reason?: string) => {
      if (!selectedAppointment) return

      setIsUpdatingStatus(true)
      try {
        const result = await updateStatus(selectedAppointment.id, newStatus, reason)

        if (result.error) {
          toast.error(result.error)
          return
        }

        toast.success(successMessage)
        closeEditSheet()
        onSuccess()
      } catch {
        toast.error("Erro ao atualizar status")
      } finally {
        setIsUpdatingStatus(false)
      }
    },
    [selectedAppointment, closeEditSheet, onSuccess]
  )

  const handleResendConfirmation = useCallback(async () => {
    if (!selectedAppointment) return

    setIsResendingConfirmation(true)
    try {
      const result = await resendConfirmation(selectedAppointment.id)

      if (result.error) {
        toast.error(result.error)
        return
      }

      const channels = result.notificationsSent?.join(" e ") || "notificacao"
      toast.success(`Links de confirmacao reenviados via ${channels}`)
    } catch {
      toast.error("Erro ao reenviar confirmacao")
    } finally {
      setIsResendingConfirmation(false)
    }
  }, [selectedAppointment])

  const handleToggleException = useCallback(
    async (action: "skip" | "unskip") => {
      if (!selectedAppointment?.recurrence) return

      const appointmentDate = new Date(selectedAppointment.scheduledAt)
      const dateStr = appointmentDate.toISOString().split("T")[0]

      setIsManagingException(true)
      try {
        const result = await toggleRecurrenceException(
          selectedAppointment.recurrence.id,
          dateStr,
          action
        )

        if (result.error) {
          toast.error(result.error)
          return
        }

        toast.success(result.message || `Data ${action === "skip" ? "pulada" : "restaurada"} com sucesso`)

        // Update local state
        if (selectedAppointment.recurrence && result.exceptions) {
          setSelectedAppointment({
            ...selectedAppointment,
            recurrence: {
              ...selectedAppointment.recurrence,
              exceptions: result.exceptions,
            },
            ...(action === "skip" && {
              status: "CANCELADO_PROFISSIONAL",
              cancellationReason: "Excecao na recorrencia - data pulada",
            }),
            ...(action === "unskip" &&
              selectedAppointment.status === "CANCELADO_PROFISSIONAL" &&
              selectedAppointment.cancellationReason === "Excecao na recorrencia - data pulada" && {
                status: "AGENDADO",
                cancellationReason: null,
              }),
          } as Appointment)
        }

        onSuccess()
      } catch {
        toast.error(`Erro ao ${action === "skip" ? "pular" : "restaurar"} data`)
      } finally {
        setIsManagingException(false)
      }
    },
    [selectedAppointment, setSelectedAppointment, onSuccess]
  )

  const handleDeleteAppointment = useCallback(async () => {
    if (!selectedAppointment) return

    setIsDeletingAppointment(true)
    try {
      const result = await deleteAppointment(selectedAppointment.id)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success("Agendamento excluido com sucesso")
      setIsDeleteDialogOpen(false)
      closeEditSheet()
      onSuccess()
    } catch {
      toast.error("Erro ao excluir agendamento")
    } finally {
      setIsDeletingAppointment(false)
    }
  }, [selectedAppointment, closeEditSheet, onSuccess])

  return {
    isUpdatingStatus,
    handleUpdateStatus,
    isResendingConfirmation,
    handleResendConfirmation,
    isManagingException,
    handleToggleException,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isDeletingAppointment,
    handleDeleteAppointment,
  }
}
