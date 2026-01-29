import { useState, useCallback } from "react"
import { toast } from "sonner"
import type { Appointment, CancelType } from "../lib/types"
import {
  cancelAppointment,
  updateStatus,
  resendConfirmation,
  toggleRecurrenceException,
} from "../services"

export interface UseAppointmentActionsParams {
  selectedAppointment: Appointment | null
  setSelectedAppointment: (appointment: Appointment | null) => void
  closeEditSheet: () => void
  onSuccess: () => void
}

export interface UseAppointmentActionsReturn {
  // Cancel dialog
  isCancelDialogOpen: boolean
  setIsCancelDialogOpen: (open: boolean) => void
  handleCancelAppointment: (reason: string, notifyPatient: boolean, cancelType: CancelType) => Promise<void>

  // Status updates
  isUpdatingStatus: boolean
  handleUpdateStatus: (newStatus: string, successMessage: string) => Promise<void>

  // Resend confirmation
  isResendingConfirmation: boolean
  handleResendConfirmation: () => Promise<void>

  // Recurrence management
  isManagingException: boolean
  isRecurrenceEditSheetOpen: boolean
  setIsRecurrenceEditSheetOpen: (open: boolean) => void
  handleToggleException: (action: "skip" | "unskip") => Promise<void>
}

export function useAppointmentActions({
  selectedAppointment,
  setSelectedAppointment,
  closeEditSheet,
  onSuccess,
}: UseAppointmentActionsParams): UseAppointmentActionsReturn {
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)
  const [isManagingException, setIsManagingException] = useState(false)
  const [isRecurrenceEditSheetOpen, setIsRecurrenceEditSheetOpen] = useState(false)

  const handleCancelAppointment = useCallback(
    async (reason: string, notifyPatient: boolean, cancelType: CancelType) => {
      if (!selectedAppointment) return

      const result = await cancelAppointment(selectedAppointment.id, {
        reason,
        notifyPatient,
        cancelType,
      })

      if (result.error) {
        toast.error(result.error)
        throw new Error(result.error)
      }

      if (result.cancelType === "series" && result.cancelledCount && result.cancelledCount > 1) {
        toast.success(`${result.cancelledCount} agendamentos cancelados com sucesso`)
      } else {
        toast.success("Agendamento cancelado com sucesso")
      }
      if (result.notificationCreated) {
        toast.success("Notificacao enviada ao paciente")
      }

      setIsCancelDialogOpen(false)
      closeEditSheet()
      onSuccess()
    },
    [selectedAppointment, closeEditSheet, onSuccess]
  )

  const handleUpdateStatus = useCallback(
    async (newStatus: string, successMessage: string) => {
      if (!selectedAppointment) return

      setIsUpdatingStatus(true)
      try {
        const result = await updateStatus(selectedAppointment.id, newStatus)

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

  return {
    isCancelDialogOpen,
    setIsCancelDialogOpen,
    handleCancelAppointment,
    isUpdatingStatus,
    handleUpdateStatus,
    isResendingConfirmation,
    handleResendConfirmation,
    isManagingException,
    isRecurrenceEditSheetOpen,
    setIsRecurrenceEditSheetOpen,
    handleToggleException,
  }
}
