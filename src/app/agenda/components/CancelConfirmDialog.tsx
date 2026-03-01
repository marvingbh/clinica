"use client"

import { useState } from "react"
import { Dialog } from "./Sheet"
import { AlertTriangleIcon } from "@/shared/components/ui/icons"

export type CancelVariant = "faltou" | "desmarcou" | "sem_cobranca"

const CANCEL_CONFIG: Record<CancelVariant, {
  title: string
  status: string
  description: string
  paymentMessage: string
  paymentColor: string
  buttonLabel: string
  buttonColor: string
}> = {
  faltou: {
    title: "Marcar como Falta",
    status: "CANCELADO_FALTA",
    description: "O paciente não compareceu a esta sessão.",
    paymentMessage: "Sessão será cobrada normalmente na fatura.",
    paymentColor: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
    buttonLabel: "Confirmar Falta",
    buttonColor: "bg-amber-600 hover:bg-amber-700",
  },
  desmarcou: {
    title: "Marcar como Desmarcou",
    status: "CANCELADO_ACORDADO",
    description: "O paciente desmarcou a sessão.",
    paymentMessage: "Sessão gera crédito para desconto em fatura futura.",
    paymentColor: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300",
    buttonLabel: "Confirmar Desmarcou",
    buttonColor: "bg-teal-600 hover:bg-teal-700",
  },
  sem_cobranca: {
    title: "Cancelar sem Cobrança",
    status: "CANCELADO_PROFISSIONAL",
    description: "A sessão será cancelada sem nenhuma cobrança.",
    paymentMessage: "Sessão não será cobrada e não aparecerá na fatura.",
    paymentColor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400",
    buttonLabel: "Confirmar Cancelamento",
    buttonColor: "bg-red-600 hover:bg-red-700",
  },
}

interface CancelConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  variant: CancelVariant
  onConfirm: (status: string, reason: string) => Promise<void>
}

export function CancelConfirmDialog({ isOpen, onClose, variant, onConfirm }: CancelConfirmDialogProps) {
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const config = CANCEL_CONFIG[variant]

  function handleClose() {
    setReason("")
    onClose()
  }

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      await onConfirm(config.status, reason.trim())
      handleClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title={config.title}>
      <p className="text-sm text-muted-foreground mb-4">
        {config.description}
      </p>

      {/* Payment impact message */}
      <div className={`p-3 rounded-xl border text-sm font-medium mb-4 flex items-start gap-2.5 ${config.paymentColor}`}>
        <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{config.paymentMessage}</span>
      </div>

      {/* Optional reason */}
      <div className="mb-4">
        <label htmlFor="cancelReason" className="block text-sm font-medium text-foreground mb-1.5">
          Motivo (opcional)
        </label>
        <textarea
          id="cancelReason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Informe o motivo..."
          className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className={`flex-1 h-11 rounded-xl text-white font-medium text-sm transition-colors disabled:opacity-50 ${config.buttonColor}`}
        >
          {isSubmitting ? "Processando..." : config.buttonLabel}
        </button>
      </div>
    </Dialog>
  )
}
