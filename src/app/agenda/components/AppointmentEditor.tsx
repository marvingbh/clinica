"use client"

import { useState } from "react"
import { UseFormReturn } from "react-hook-form"
import { Sheet } from "./Sheet"
import { InlineAlert } from "./InlineAlert"
import { SegmentedControl, Segment } from "./SegmentedControl"
import { RecurrenceTabContent } from "./RecurrenceTabContent"
import { Appointment, EditAppointmentFormData } from "../lib/types"
import { STATUS_LABELS, STATUS_COLORS, RECURRENCE_TYPE_LABELS } from "../lib/constants"
import { formatPhone, isDateException } from "../lib/utils"
import { RefreshCwIcon, BanIcon } from "@/shared/components/ui/icons"

interface AppointmentEditorProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  form: UseFormReturn<EditAppointmentFormData>
  isUpdating: boolean
  onSubmit: (data: EditAppointmentFormData) => Promise<void>
  // API error
  apiError?: string | null
  onDismissError?: () => void
  // Status actions
  canMarkStatus: boolean
  onUpdateStatus: (status: string, message: string) => Promise<void>
  isUpdatingStatus: boolean
  // Confirmation
  canResendConfirmation: boolean
  onResendConfirmation: () => Promise<void>
  isResendingConfirmation: boolean
  // Cancel
  canCancel: boolean
  onCancelClick: () => void
  // Delete
  isDeleteDialogOpen: boolean
  setIsDeleteDialogOpen: (open: boolean) => void
  isDeletingAppointment: boolean
  onDeleteAppointment: () => Promise<void>
  // Recurrence
  onToggleException: (action: "skip" | "unskip") => Promise<void>
  isManagingException: boolean
  onRecurrenceSave: () => void
}

type EditorTab = "occurrence" | "recurrence"

export function AppointmentEditor({
  isOpen,
  onClose,
  appointment,
  form,
  isUpdating,
  onSubmit,
  apiError,
  onDismissError,
  canMarkStatus,
  onUpdateStatus,
  isUpdatingStatus,
  canResendConfirmation,
  onResendConfirmation,
  isResendingConfirmation,
  canCancel,
  onCancelClick,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  isDeletingAppointment,
  onDeleteAppointment,
  onToggleException,
  isManagingException,
  onRecurrenceSave,
}: AppointmentEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("occurrence")

  // Reset tab when opening a new appointment
  const handleClose = () => {
    setActiveTab("occurrence")
    onClose()
  }

  if (!appointment) return null

  const isRecurring = !!appointment.recurrence
  const isException = isDateException(appointment)
  const isActive = appointment.recurrence?.isActive ?? false

  // Build segments for the segmented control
  const segments: Segment[] = [
    { key: "occurrence", label: "Esta consulta" },
  ]

  if (isRecurring && isActive) {
    segments.push({ key: "recurrence", label: "Recorrencia" })
  }

  // Skip toggle button as trailing element
  const skipToggle = isRecurring && isActive ? (
    <button
      type="button"
      onClick={() => onToggleException(isException ? "unskip" : "skip")}
      disabled={isManagingException}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] disabled:opacity-50 ${
        isException
          ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
          : "text-muted-foreground hover:text-foreground hover:bg-background"
      }`}
    >
      {isManagingException ? (
        "..."
      ) : isException ? (
        <>
          <RefreshCwIcon className="w-4 h-4" />
          <span>Pulada</span>
        </>
      ) : (
        <>
          <BanIcon className="w-4 h-4" />
          <span>Pular</span>
        </>
      )}
    </button>
  ) : null

  return (
    <Sheet isOpen={isOpen} onClose={handleClose} title="Editar Agendamento">
      {/* Compact Header */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium text-foreground truncate">{appointment.patient.name}</p>
              <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[appointment.status] || "bg-gray-100 text-gray-800 border-gray-200"}`}>
                {STATUS_LABELS[appointment.status] || appointment.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{appointment.professionalProfile.user.name}</p>
            {isRecurring && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                <RefreshCwIcon className="w-3 h-3 inline mr-1" />
                {RECURRENCE_TYPE_LABELS[appointment.recurrence!.recurrenceType]}
                {appointment.recurrence!.recurrenceEndType === "INDEFINITE" && " - sem fim"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Segmented Control (only for recurring) */}
      {isRecurring && isActive && (
        <div className="px-4 pt-4">
          <SegmentedControl
            segments={segments}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as EditorTab)}
            trailing={skipToggle}
          />
        </div>
      )}

      {/* Exception warning */}
      {isException && activeTab === "occurrence" && (
        <div className="mx-4 mt-4 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-md border border-orange-200 dark:border-orange-800">
          <p className="text-sm text-orange-800 dark:text-orange-200">
            Esta data foi marcada como excecao (pulada). Clique em &ldquo;Pulada&rdquo; para restaurar.
          </p>
        </div>
      )}

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === "occurrence" ? (
          <OccurrenceTabContent
            appointment={appointment}
            form={form}
            isUpdating={isUpdating}
            onSubmit={onSubmit}
            apiError={apiError}
            onDismissError={onDismissError}
            onClose={handleClose}
            canMarkStatus={canMarkStatus}
            onUpdateStatus={onUpdateStatus}
            isUpdatingStatus={isUpdatingStatus}
            canResendConfirmation={canResendConfirmation}
            onResendConfirmation={onResendConfirmation}
            isResendingConfirmation={isResendingConfirmation}
            canCancel={canCancel}
            onCancelClick={onCancelClick}
            isDeleteDialogOpen={isDeleteDialogOpen}
            setIsDeleteDialogOpen={setIsDeleteDialogOpen}
            isDeletingAppointment={isDeletingAppointment}
            onDeleteAppointment={onDeleteAppointment}
            isRecurring={isRecurring}
          />
        ) : (
          <RecurrenceTabContent
            appointment={appointment}
            onSave={onRecurrenceSave}
            onClose={handleClose}
          />
        )}
      </div>
    </Sheet>
  )
}

// Occurrence Tab Content
interface OccurrenceTabContentProps {
  appointment: Appointment
  form: UseFormReturn<EditAppointmentFormData>
  isUpdating: boolean
  onSubmit: (data: EditAppointmentFormData) => Promise<void>
  apiError?: string | null
  onDismissError?: () => void
  onClose: () => void
  canMarkStatus: boolean
  onUpdateStatus: (status: string, message: string) => Promise<void>
  isUpdatingStatus: boolean
  canResendConfirmation: boolean
  onResendConfirmation: () => Promise<void>
  isResendingConfirmation: boolean
  canCancel: boolean
  onCancelClick: () => void
  isDeleteDialogOpen: boolean
  setIsDeleteDialogOpen: (open: boolean) => void
  isDeletingAppointment: boolean
  onDeleteAppointment: () => Promise<void>
  isRecurring: boolean
}

function OccurrenceTabContent({
  appointment,
  form,
  isUpdating,
  onSubmit,
  apiError,
  onDismissError,
  onClose,
  canMarkStatus,
  onUpdateStatus,
  isUpdatingStatus,
  canResendConfirmation,
  onResendConfirmation,
  isResendingConfirmation,
  canCancel,
  onCancelClick,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  isDeletingAppointment,
  onDeleteAppointment,
  isRecurring,
}: OccurrenceTabContentProps) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      {/* Patient contact info (collapsible on mobile) */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
          Contato do paciente
        </summary>
        <div className="mt-2 pl-4 space-y-1 text-sm text-muted-foreground">
          <p>{formatPhone(appointment.patient.phone)}</p>
          {appointment.patient.email && <p>{appointment.patient.email}</p>}
        </div>
      </details>

      {/* Date + Time (same row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="editDate" className="block text-sm font-medium text-foreground mb-2">Data *</label>
          <input
            id="editDate"
            type="text"
            placeholder="DD/MM/AAAA"
            {...form.register("date")}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {form.formState.errors.date && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="editStartTime" className="block text-sm font-medium text-foreground mb-2">Horario *</label>
          <input
            id="editStartTime"
            type="text"
            placeholder="Ex: 14:30"
            pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
            {...form.register("startTime")}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {form.formState.errors.startTime && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.startTime.message}</p>
          )}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label htmlFor="editDuration" className="block text-sm font-medium text-foreground mb-2">Duracao (minutos)</label>
        <input
          id="editDuration"
          type="number"
          {...form.register("duration", {
            setValueAs: (v) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v)
          })}
          min={15}
          max={480}
          step={5}
          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Modality */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Modalidade *</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="relative flex items-center justify-center cursor-pointer">
            <input type="radio" value="PRESENCIAL" {...form.register("modality")} className="sr-only peer" />
            <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
              <span className="text-sm font-medium">Presencial</span>
            </div>
          </label>
          <label className="relative flex items-center justify-center cursor-pointer">
            <input type="radio" value="ONLINE" {...form.register("modality")} className="sr-only peer" />
            <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
              <span className="text-sm font-medium">Online</span>
            </div>
          </label>
        </div>
      </div>

      {/* Price */}
      <div>
        <label htmlFor="editPrice" className="block text-sm font-medium text-foreground mb-2">Valor (R$)</label>
        <input
          id="editPrice"
          type="number"
          step="0.01"
          {...form.register("price", { valueAsNumber: true })}
          placeholder="0.00"
          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="editNotes" className="block text-sm font-medium text-foreground mb-2">Observacoes</label>
        <textarea
          id="editNotes"
          rows={3}
          {...form.register("notes")}
          className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Helper text for recurring */}
      {isRecurring && (
        <p className="text-xs text-muted-foreground">
          Alteracoes aplicam-se apenas a esta data.
        </p>
      )}

      {/* Action Buttons */}
      <div className="space-y-3 pt-4 border-t border-border">
        {canMarkStatus && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")}
              disabled={isUpdatingStatus}
              className="h-11 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {isUpdatingStatus ? "..." : "Finalizar Consulta"}
            </button>
            <button
              type="button"
              onClick={() => onUpdateStatus("NAO_COMPARECEU", "Paciente marcado como nao compareceu")}
              disabled={isUpdatingStatus}
              className="h-11 rounded-md bg-yellow-600 text-white font-medium hover:bg-yellow-700 disabled:opacity-50"
            >
              {isUpdatingStatus ? "..." : "Nao Compareceu"}
            </button>
          </div>
        )}

        {canResendConfirmation && (
          <button
            type="button"
            onClick={onResendConfirmation}
            disabled={isResendingConfirmation}
            className="w-full h-11 rounded-md border border-primary text-primary font-medium hover:bg-primary/5 disabled:opacity-50"
          >
            {isResendingConfirmation ? "Reenviando..." : "Reenviar Links de Confirmacao"}
          </button>
        )}

        {canCancel && (
          <button
            type="button"
            onClick={onCancelClick}
            className="w-full h-11 rounded-md border border-red-500 text-red-600 font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Cancelar Agendamento
          </button>
        )}

        {/* Delete button - subtle, not highlighted */}
        <button
          type="button"
          onClick={() => setIsDeleteDialogOpen(true)}
          className="w-full h-9 text-sm text-muted-foreground hover:text-destructive transition-colors"
        >
          Excluir agendamento
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg p-6 max-w-sm mx-4 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground mb-2">Excluir agendamento?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Esta acao nao pode ser desfeita. O agendamento sera permanentemente removido do sistema.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={isDeletingAppointment}
                className="flex-1 h-10 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onDeleteAppointment}
                disabled={isDeletingAppointment}
                className="flex-1 h-10 rounded-md bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDeletingAppointment ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Error Alert */}
      {apiError && onDismissError && (
        <InlineAlert message={apiError} onDismiss={onDismissError} />
      )}

      {/* Footer */}
      <div className="flex gap-3 pt-4 pb-8">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
        >
          Fechar
        </button>
        <button
          type="submit"
          disabled={isUpdating}
          className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isUpdating ? "Salvando..." : "Salvar Alteracoes"}
        </button>
      </div>
    </form>
  )
}
