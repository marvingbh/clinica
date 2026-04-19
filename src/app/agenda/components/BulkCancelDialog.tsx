"use client"

import { useState, useCallback } from "react"
import { Dialog } from "./Sheet"
import { toast } from "sonner"
import { BanIcon, AlertTriangleIcon } from "@/shared/components/ui/icons"
import { toDateString } from "../lib/utils"
import {
  bulkCancelPreview,
  bulkCancelExecute,
  type BulkCancelPreviewAppointment,
} from "../services/appointmentService"
import type { Professional } from "../lib/types"

interface BulkCancelDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** Pre-filled start date (from agenda context) */
  initialDate?: Date
  professionals: Professional[]
  /** Whether user can manage other professionals' appointments */
  canManageOthers: boolean
  /** Current user's professionalProfileId */
  userProfessionalId: string | null
  /** Currently selected professional in the agenda */
  selectedProfessionalId?: string
}

type Step = "filters" | "confirm"

export function BulkCancelDialog({
  isOpen,
  onClose,
  onSuccess,
  initialDate,
  professionals,
  canManageOthers,
  userProfessionalId,
  selectedProfessionalId,
}: BulkCancelDialogProps) {
  const initialDateStr = initialDate ? toDateString(initialDate) : toDateString(new Date())

  const [step, setStep] = useState<Step>("filters")
  const [startDate, setStartDate] = useState(initialDateStr)
  const [endDate, setEndDate] = useState(initialDateStr)
  const [profId, setProfId] = useState(selectedProfessionalId || "")
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewAppointments, setPreviewAppointments] = useState<BulkCancelPreviewAppointment[]>([])
  const [previewSummary, setPreviewSummary] = useState<{
    total: number
    byType: Record<string, number>
    patients: Array<{ id: string; name: string }>
  } | null>(null)

  const reset = useCallback(() => {
    setStep("filters")
    setStartDate(initialDate ? toDateString(initialDate) : toDateString(new Date()))
    setEndDate(initialDate ? toDateString(initialDate) : toDateString(new Date()))
    setProfId(selectedProfessionalId || "")
    setReason("")
    setPreviewAppointments([])
    setPreviewSummary(null)
  }, [initialDate, selectedProfessionalId])

  function handleClose() {
    reset()
    onClose()
  }

  async function handlePreview() {
    setIsLoading(true)
    const result = await bulkCancelPreview({
      startDate,
      endDate,
      professionalProfileId: profId || undefined,
    })
    setIsLoading(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    if (result.summary?.total === 0) {
      toast.info("Nenhum agendamento encontrado para o periodo selecionado")
      return
    }

    setPreviewAppointments(result.appointments ?? [])
    setPreviewSummary(result.summary ?? null)
    setStep("confirm")
  }

  async function handleExecute() {
    if (reason.trim().length < 3) {
      toast.error("Motivo deve ter pelo menos 3 caracteres")
      return
    }

    setIsSubmitting(true)
    try {
      const ids = previewAppointments.map((a) => a.id)
      const result = await bulkCancelExecute(ids, reason.trim())

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(`${result.cancelledCount} agendamento(s) cancelado(s)`)
      handleClose()
      onSuccess()
    } catch {
      toast.error("Erro ao cancelar agendamentos. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Format date for display: YYYY-MM-DD -> DD/MM/YYYY
  function formatDateBR(dateStr: string): string {
    const [y, m, d] = dateStr.split("-")
    return `${d}/${m}/${y}`
  }

  const TYPE_LABELS: Record<string, string> = {
    CONSULTA: "Consultas",
    REUNIAO: "Reunioes",
  }

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title="Cancelar Agendamentos">
      {step === "filters" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cancele agendamentos de um periodo. Apenas consultas e reunioes com status agendado ou confirmado serao afetados.
          </p>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bulkStartDate" className="block text-sm font-medium text-foreground mb-1.5">
                Data inicial
              </label>
              <input
                id="bulkStartDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
              />
            </div>
            <div>
              <label htmlFor="bulkEndDate" className="block text-sm font-medium text-foreground mb-1.5">
                Data final
              </label>
              <input
                id="bulkEndDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
              />
            </div>
          </div>

          {/* Professional selector */}
          {canManageOthers && professionals.length > 0 && (
            <div>
              <label htmlFor="bulkProfessional" className="block text-sm font-medium text-foreground mb-1.5">
                Profissional
              </label>
              <select
                id="bulkProfessional"
                value={profId}
                onChange={(e) => setProfId(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
              >
                <option value="">Todos os profissionais</option>
                {professionals.map((prof) => (
                  <option key={prof.id} value={prof.professionalProfile?.id || ""}>
                    {prof.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={isLoading || !startDate || !endDate}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Buscando..." : "Visualizar"}
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && previewSummary && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className="p-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm font-medium flex items-start gap-2.5">
            <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {previewSummary.total} agendamento(s) serao cancelados sem cobranca
              {startDate === endDate
                ? ` em ${formatDateBR(startDate)}`
                : ` de ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`}
            </span>
          </div>

          {/* Type breakdown */}
          <div className="flex gap-3">
            {Object.entries(previewSummary.byType).map(([type, count]) => (
              <div
                key={type}
                className="flex-1 p-2.5 rounded-lg bg-muted text-center"
              >
                <div className="text-lg font-semibold text-foreground">{count}</div>
                <div className="text-xs text-muted-foreground">{TYPE_LABELS[type] || type}</div>
              </div>
            ))}
          </div>

          {/* Patient list */}
          {previewSummary.patients.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-1.5">
                Pacientes afetados ({previewSummary.patients.length})
              </p>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
                {previewSummary.patients.map((p) => (
                  <div key={p.id} className="text-sm text-muted-foreground">
                    {p.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label htmlFor="bulkReason" className="block text-sm font-medium text-foreground mb-1.5">
              Motivo (obrigatorio)
            </label>
            <textarea
              id="bulkReason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Feriado, ferias, emergencia..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("filters")}
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isSubmitting || reason.trim().length < 3}
              className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <BanIcon className="w-4 h-4" />
              {isSubmitting ? "Cancelando..." : "Confirmar Cancelamento"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
