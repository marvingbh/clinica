"use client"

import { useState } from "react"
import { Dialog } from "./Sheet"
import { Appointment, CancelType } from "../lib/types"
import { hasNotificationConsent } from "../lib/utils"

interface CancelDialogProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onConfirm: (reason: string, notifyPatient: boolean, cancelType: CancelType) => Promise<void>
}

export function CancelDialog({ isOpen, onClose, appointment, onConfirm }: CancelDialogProps) {
  const [cancelReason, setCancelReason] = useState("")
  const [notifyPatient, setNotifyPatient] = useState(true)
  const [cancelType, setCancelType] = useState<CancelType>("single")
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!appointment) return null

  const hasConsent = hasNotificationConsent(appointment)
  const hasRecurrence = !!appointment.recurrence

  async function handleConfirm() {
    if (!cancelReason.trim()) return

    setIsSubmitting(true)
    try {
      await onConfirm(cancelReason.trim(), notifyPatient, cancelType)
      handleClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClose() {
    setCancelReason("")
    setNotifyPatient(true)
    setCancelType("single")
    onClose()
  }

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title="Cancelar Agendamento">
      <p className="text-sm text-muted-foreground mb-4">
        Esta acao nao pode ser desfeita. O agendamento sera marcado como cancelado pelo profissional.
      </p>

      {/* Cancel Type - Only show if has recurrence */}
      {hasRecurrence && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            O que cancelar?
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer p-3 border border-input rounded-md hover:bg-muted/50 transition-colors">
              <input
                type="radio"
                name="cancelType"
                value="single"
                checked={cancelType === "single"}
                onChange={() => setCancelType("single")}
                className="w-4 h-4 text-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Somente este agendamento</p>
                <p className="text-xs text-muted-foreground">Os outros agendamentos da serie serao mantidos</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-3 border border-input rounded-md hover:bg-muted/50 transition-colors">
              <input
                type="radio"
                name="cancelType"
                value="series"
                checked={cancelType === "series"}
                onChange={() => setCancelType("series")}
                className="w-4 h-4 text-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Toda a serie</p>
                <p className="text-xs text-muted-foreground">Cancela este e todos os agendamentos futuros da serie</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Cancel Reason */}
      <div className="mb-4">
        <label htmlFor="cancelReason" className="block text-sm font-medium text-foreground mb-2">
          Motivo do cancelamento *
        </label>
        <textarea
          id="cancelReason"
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Informe o motivo do cancelamento..."
          className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
        />
      </div>

      {/* Notify Patient Option */}
      {hasConsent && (
        <div className="mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyPatient}
              onChange={(e) => setNotifyPatient(e.target.checked)}
              className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
            />
            <span className="text-sm text-foreground">
              Notificar paciente sobre o cancelamento
            </span>
          </label>
          <p className="text-xs text-muted-foreground mt-1 ml-8">
            O paciente sera notificado via {appointment.patient.consentWhatsApp && appointment.patient.consentEmail ? "WhatsApp e email" : appointment.patient.consentWhatsApp ? "WhatsApp" : "email"}
          </p>
        </div>
      )}

      {!hasConsent && (
        <div className="mb-6 p-3 bg-muted/50 rounded-md">
          <p className="text-xs text-muted-foreground">
            O paciente nao possui consentimento para receber notificacoes.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="flex-1 h-11 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-colors"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || !cancelReason.trim()}
          className="flex-1 h-11 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Cancelando..." : "Confirmar Cancelamento"}
        </button>
      </div>
    </Dialog>
  )
}
