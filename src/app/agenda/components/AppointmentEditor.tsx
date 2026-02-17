"use client"

import { useState } from "react"
import { UseFormReturn } from "react-hook-form"
import { Sheet } from "./Sheet"
import { InlineAlert } from "./InlineAlert"
import { SegmentedControl, Segment } from "./SegmentedControl"
import { RecurrenceTabContent } from "./RecurrenceTabContent"
import { Appointment, EditAppointmentFormData, CalendarEntryType, Professional } from "../lib/types"
import { TimeInput } from "./TimeInput"
import { STATUS_LABELS, STATUS_COLORS, RECURRENCE_TYPE_LABELS, ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from "../lib/constants"
import { formatPhone, isDateException, calculateEndTime } from "../lib/utils"
import {
  RefreshCwIcon,
  BanIcon,
  ClockIcon,
  PhoneIcon,
  MailIcon,
  CheckCircleIcon,
  BuildingIcon,
  VideoIcon,
  UserIcon,
  AlertTriangleIcon,
  TrashIcon,
} from "@/shared/components/ui/icons"

// ============================================================================
// Helpers
// ============================================================================

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
}

function formatDateDisplay(date: Date): string {
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
  const day = date.getDate()
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day} de ${month}`
}

// ============================================================================
// AppointmentEditor (main wrapper)
// ============================================================================

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
  // Additional professionals editing
  professionals?: Professional[]
  editAdditionalProfIds?: string[]
  setEditAdditionalProfIds?: (ids: string[]) => void
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
  professionals,
  editAdditionalProfIds,
  setEditAdditionalProfIds,
}: AppointmentEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("occurrence")

  const handleClose = () => {
    setActiveTab("occurrence")
    onClose()
  }

  if (!appointment) return null

  const isConsulta = appointment.type === "CONSULTA"
  const isRecurring = !!appointment.recurrence
  const isException = isDateException(appointment)
  const isActive = appointment.recurrence?.isActive ?? false

  // Format appointment time for header display
  const scheduled = new Date(appointment.scheduledAt)
  const end = new Date(appointment.endAt)
  const timeRange = `${formatTime(scheduled)} — ${formatTime(end)}`
  const durationMin = Math.round((end.getTime() - scheduled.getTime()) / 60000)
  const dateDisplay = formatDateDisplay(scheduled)

  // Build segments for the segmented control
  const occurrenceLabel = isConsulta ? "Esta consulta" : "Esta entrada"
  const segments: Segment[] = [
    { key: "occurrence", label: occurrenceLabel },
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
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors min-h-[40px] disabled:opacity-50 ${
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

  const sheetTitle = isConsulta ? "Editar Agendamento" : `Editar ${ENTRY_TYPE_LABELS[appointment.type as CalendarEntryType] || "Entrada"}`

  return (
    <Sheet isOpen={isOpen} onClose={handleClose} title={sheetTitle}>
      {/* ── Rich Header ── */}
      <div className="px-4 pt-3 pb-4 bg-muted/30 border-b border-border">
        {/* Top row: name + status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            {isConsulta && appointment.patient ? (
              <h3 className="font-semibold text-lg text-foreground truncate leading-tight">
                {appointment.patient.name}
              </h3>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {!isConsulta && (
                  <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${
                    ENTRY_TYPE_COLORS[appointment.type as CalendarEntryType]
                      ? `${ENTRY_TYPE_COLORS[appointment.type as CalendarEntryType].bg} ${ENTRY_TYPE_COLORS[appointment.type as CalendarEntryType].text} border ${ENTRY_TYPE_COLORS[appointment.type as CalendarEntryType].border}`
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {ENTRY_TYPE_LABELS[appointment.type as CalendarEntryType] || appointment.type}
                  </span>
                )}
                <h3 className="font-semibold text-lg text-foreground truncate leading-tight">
                  {appointment.title || "Sem titulo"}
                </h3>
              </div>
            )}
          </div>
          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border mt-0.5 ${
            STATUS_COLORS[appointment.status] || "bg-gray-100 text-gray-800 border-gray-200"
          }`}>
            {STATUS_LABELS[appointment.status] || appointment.status}
          </span>
        </div>

        {/* Appointment details card */}
        <div className="rounded-xl bg-background/70 dark:bg-background/40 border border-border/60 px-3.5 py-2.5 space-y-1.5">
          {/* Date + time row */}
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <ClockIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-foreground">{dateDisplay}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-foreground tabular-nums font-medium">{timeRange}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-muted-foreground text-xs">{durationMin} min</span>
          </div>

          {/* Professional + modality row */}
          <div className="flex items-center gap-2 text-sm">
            <UserIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">
              {appointment.professionalProfile.user.name}
              {(appointment.additionalProfessionals?.length ?? 0) > 0 && (
                <span className="text-xs"> +{appointment.additionalProfessionals!.map(ap => ap.professionalProfile.user.name).join(", ")}</span>
              )}
            </span>
            {isConsulta && appointment.modality && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                  {appointment.modality === "ONLINE" ? (
                    <VideoIcon className="w-3.5 h-3.5" />
                  ) : (
                    <BuildingIcon className="w-3.5 h-3.5" />
                  )}
                  {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Contact row - clickable links */}
        {isConsulta && appointment.patient && (
          <div className="flex items-center gap-4 mt-3 text-sm">
            <a
              href={`tel:${appointment.patient.phone}`}
              className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
            >
              <PhoneIcon className="w-3.5 h-3.5 text-muted-foreground" />
              {formatPhone(appointment.patient.phone)}
            </a>
            {appointment.patient.email && (
              <a
                href={`mailto:${appointment.patient.email}`}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors truncate min-w-0"
              >
                <MailIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{appointment.patient.email}</span>
              </a>
            )}
          </div>
        )}

        {/* Recurrence info */}
        {isRecurring && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <RefreshCwIcon className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {RECURRENCE_TYPE_LABELS[appointment.recurrence!.recurrenceType]}
              {appointment.recurrence!.recurrenceEndType === "INDEFINITE" && " · sem fim"}
            </span>
          </div>
        )}
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
        <div className="mx-4 mt-4 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-200 dark:border-orange-800">
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
            isConsulta={isConsulta}
            professionals={professionals}
            editAdditionalProfIds={editAdditionalProfIds}
            setEditAdditionalProfIds={setEditAdditionalProfIds}
          />
        ) : (
          <RecurrenceTabContent
            appointment={appointment}
            onSave={onRecurrenceSave}
            onClose={handleClose}
            professionals={professionals}
          />
        )}
      </div>
    </Sheet>
  )
}

// ============================================================================
// OccurrenceTabContent
// ============================================================================

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
  isConsulta: boolean
  professionals?: Professional[]
  editAdditionalProfIds?: string[]
  setEditAdditionalProfIds?: (ids: string[]) => void
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
  isConsulta,
  professionals,
  editAdditionalProfIds,
  setEditAdditionalProfIds,
}: OccurrenceTabContentProps) {
  const isCancelled = ["CANCELADO_PROFISSIONAL", "CANCELADO_PACIENTE"].includes(appointment.status)
  const isNoShow = appointment.status === "NAO_COMPARECEU"
  const isFinished = appointment.status === "FINALIZADO"
  const isTerminal = isCancelled || isNoShow || isFinished

  const hasQuickActions = !isTerminal && (
    canMarkStatus ||
    canResendConfirmation
  )

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

      {/* ── Quick Actions (status-first UX) ── */}
      {hasQuickActions && (
        <div className="space-y-2.5">
          {/* AGENDADO: Confirm + Finalize + No Show — 3-col grid */}
          {canMarkStatus && isConsulta && appointment.status === "AGENDADO" && (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onUpdateStatus("CONFIRMADO", "Consulta confirmada com sucesso")}
                disabled={isUpdatingStatus}
                className="h-11 rounded-xl bg-blue-600 text-white font-medium text-sm flex items-center justify-center gap-1.5 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <CheckCircleIcon className="w-4 h-4" />
                {isUpdatingStatus ? "..." : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")}
                disabled={isUpdatingStatus}
                className="h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isUpdatingStatus ? "..." : "Atendido"}
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("NAO_COMPARECEU", "Paciente marcado como nao compareceu")}
                disabled={isUpdatingStatus}
                className="h-11 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-medium text-sm flex items-center justify-center hover:bg-amber-50 dark:hover:bg-amber-950/30 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isUpdatingStatus ? "..." : "Faltou"}
              </button>
            </div>
          )}

          {/* CONFIRMADO: Finalize + No Show — 2-col grid */}
          {canMarkStatus && isConsulta && appointment.status === "CONFIRMADO" && (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")}
                disabled={isUpdatingStatus}
                className="h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isUpdatingStatus ? "..." : "Atendido"}
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("NAO_COMPARECEU", "Paciente marcado como nao compareceu")}
                disabled={isUpdatingStatus}
                className="h-11 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-medium text-sm flex items-center justify-center hover:bg-amber-50 dark:hover:bg-amber-950/30 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isUpdatingStatus ? "..." : "Nao Compareceu"}
              </button>
            </div>
          )}

          {/* Conclude — non-CONSULTA */}
          {canMarkStatus && !isConsulta && (
            <button
              type="button"
              onClick={() => onUpdateStatus("FINALIZADO", "Entrada concluida com sucesso")}
              disabled={isUpdatingStatus}
              className="w-full h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isUpdatingStatus ? "..." : "Concluir"}
            </button>
          )}

          {/* Resend confirmation */}
          {canResendConfirmation && (
            <button
              type="button"
              onClick={onResendConfirmation}
              disabled={isResendingConfirmation}
              className="w-full h-10 rounded-xl border border-border text-muted-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-muted/50 hover:text-foreground active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isResendingConfirmation ? "Reenviando..." : "Reenviar Links de Confirmacao"}
            </button>
          )}
        </div>
      )}

      {/* Terminal state context */}
      {isTerminal && (
        <div className={`p-3 rounded-xl border text-sm flex items-start gap-2.5 ${
          isFinished
            ? "bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400"
            : isNoShow
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
            : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
        }`}>
          <div className="flex-shrink-0 mt-0.5">
            {isFinished ? (
              <CheckCircleIcon className="w-4 h-4" />
            ) : (
              <AlertTriangleIcon className="w-4 h-4" />
            )}
          </div>
          <div>
            {isFinished && "Esta consulta foi finalizada."}
            {isNoShow && "Paciente nao compareceu a esta consulta."}
            {isCancelled && (
              <>
                Este agendamento foi cancelado.
                {appointment.cancellationReason && (
                  <span className="block mt-1 text-xs opacity-75">
                    Motivo: {appointment.cancellationReason}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Fields ── */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Detalhes
        </p>

        {/* Date */}
        <div>
          <label htmlFor="editDate" className="block text-sm font-medium text-foreground mb-1.5">
            Data
          </label>
          <input
            id="editDate"
            type="date"
            {...form.register("date")}
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
          />
          {form.formState.errors.date && (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.date.message}</p>
          )}
        </div>

        {/* Time + Duration + End Time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="editStartTime" className="block text-sm font-medium text-foreground mb-1.5">
              Inicio
            </label>
            <TimeInput
              id="editStartTime"
              placeholder="HH:MM"
              {...form.register("startTime")}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
            {form.formState.errors.startTime && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.startTime.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="editDuration" className="block text-sm font-medium text-foreground mb-1.5">
              Duracao
            </label>
            <input
              id="editDuration"
              type="number"
              {...form.register("duration", {
                setValueAs: (v) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v)
              })}
              min={15}
              max={480}
              step={5}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Fim
            </label>
            <div className="h-11 px-3.5 rounded-xl border border-input bg-muted/50 text-foreground text-sm flex items-center">
              {calculateEndTime(form.watch("startTime"), form.watch("duration")) || "—"}
            </div>
          </div>
        </div>

        {/* Modality — CONSULTA only */}
        {isConsulta && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Modalidade</label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="relative cursor-pointer">
                <input type="radio" value="PRESENCIAL" {...form.register("modality")} className="sr-only peer" />
                <div className="h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-input bg-background text-foreground text-sm font-medium peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary transition-all">
                  <BuildingIcon className="w-4 h-4" />
                  Presencial
                </div>
              </label>
              <label className="relative cursor-pointer">
                <input type="radio" value="ONLINE" {...form.register("modality")} className="sr-only peer" />
                <div className="h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-input bg-background text-foreground text-sm font-medium peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary transition-all">
                  <VideoIcon className="w-4 h-4" />
                  Online
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Price — CONSULTA only */}
        {isConsulta && (
          <div>
            <label htmlFor="editPrice" className="block text-sm font-medium text-foreground mb-1.5">
              Valor (R$)
            </label>
            <input
              id="editPrice"
              type="number"
              step="0.01"
              {...form.register("price", { valueAsNumber: true })}
              placeholder="0,00"
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label htmlFor="editNotes" className="block text-sm font-medium text-foreground mb-1.5">
            Observacoes
          </label>
          <textarea
            id="editNotes"
            rows={3}
            {...form.register("notes")}
            placeholder="Notas sobre esta consulta..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none"
          />
        </div>
      </div>

      {/* Additional professionals editor */}
      {professionals && editAdditionalProfIds && setEditAdditionalProfIds &&
       (isConsulta || appointment.type === "REUNIAO") &&
       professionals.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Profissionais adicionais</label>
          <div className="space-y-2 p-3 rounded-xl border border-input bg-background">
            {professionals
              .filter(p => {
                const profId = p.professionalProfile?.id
                return profId && profId !== appointment.professionalProfile.id
              })
              .map(prof => (
                <label key={prof.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAdditionalProfIds.includes(prof.professionalProfile!.id)}
                    onChange={(e) => {
                      const id = prof.professionalProfile!.id
                      if (e.target.checked) {
                        setEditAdditionalProfIds([...editAdditionalProfIds, id])
                      } else {
                        setEditAdditionalProfIds(editAdditionalProfIds.filter(x => x !== id))
                      }
                    }}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-ring/40"
                  />
                  <span className="text-sm">{prof.name}</span>
                </label>
              ))}
          </div>
        </div>
      )}

      {/* Recurring helper */}
      {isRecurring && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
          Alteracoes aplicam-se apenas a esta data.
        </p>
      )}

      {/* ── Danger Zone ── */}
      <div className="pt-4 border-t border-border/60 space-y-2.5">
        {canCancel && (
          <button
            type="button"
            onClick={onCancelClick}
            className="w-full h-10 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-medium text-sm hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all"
          >
            {isConsulta ? "Cancelar Agendamento" : "Cancelar"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsDeleteDialogOpen(true)}
          className="w-full h-9 text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center gap-1.5"
        >
          <TrashIcon className="w-3.5 h-3.5" />
          Excluir permanentemente
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-background rounded-2xl p-6 max-w-sm mx-4 shadow-2xl animate-scale-in relative">
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center flex-shrink-0">
                <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Excluir agendamento?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Esta acao nao pode ser desfeita. O agendamento sera permanentemente removido.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={isDeletingAppointment}
                className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Manter
              </button>
              <button
                type="button"
                onClick={onDeleteAppointment}
                disabled={isDeletingAppointment}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeletingAppointment ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Error */}
      {apiError && onDismissError && (
        <InlineAlert message={apiError} onDismiss={onDismissError} />
      )}

      {/* ── Footer ── */}
      <div className="flex gap-3 pt-4 pb-8">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-12 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors"
        >
          Fechar
        </button>
        <button
          type="submit"
          disabled={isUpdating}
          className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isUpdating ? "Salvando..." : "Salvar Alteracoes"}
        </button>
      </div>
    </form>
  )
}
