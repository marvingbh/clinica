"use client"

import { useState, useRef } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { UseFormReturn } from "react-hook-form"
import { Sheet } from "./Sheet"
import { InlineAlert } from "./InlineAlert"
import type { Segment } from "./SegmentedControl"
import { RecurrenceTabContent } from "./RecurrenceTabContent"
import { HistoryTimeline } from "@/shared/components/HistoryTimeline"
import { usePermission } from "@/shared/hooks/usePermission"
import { Appointment, AppointmentStatus, EditAppointmentFormData, CalendarEntryType, Professional } from "../lib/types"
import { TimeInput } from "./TimeInput"
import { DateInput } from "./DateInput"
import { STATUS_LABELS, RECURRENCE_TYPE_LABELS, ENTRY_TYPE_LABELS, CANCELLED_STATUSES } from "../lib/constants"
import { formatPhone, isDateException, calculateEndTime, isRecurrenceModified } from "../lib/utils"
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
  UsersIcon,
  AlertTriangleIcon,
  TrashIcon,
  FileTextIcon,
  CalendarIcon,
  InfoIcon,
  CheckIcon,
  ChevronDownIcon,
  XIcon,
  SendIcon,
  HistoryIcon,
  DollarSignIcon,
} from "@/shared/components/ui/icons"
import { Segmented, ChipField, type SegmentedOption } from "@/shared/components/ui/segmented"
import { CancelConfirmDialog } from "./CancelConfirmDialog"
import type { CancelVariant } from "./CancelConfirmDialog"

// ============================================================================
// Constants
// ============================================================================

const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente", ENVIADO: "Enviado", PARCIAL: "Parcial",
  PAGO: "Pago", CANCELADO: "Cancelado",
}

const MONTH_NAMES_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

// Status badge tones — drives the pill colour in the header.
const STATUS_BADGE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  AGENDADO:               { bg: "bg-brand-50",   text: "text-brand-700",  border: "border-brand-100", dot: "bg-brand-500" },
  CONFIRMADO:             { bg: "bg-ok-50",      text: "text-ok-700",     border: "border-ok-100",    dot: "bg-ok-500" },
  FINALIZADO:             { bg: "bg-ink-100",    text: "text-ink-700",    border: "border-ink-200",   dot: "bg-ink-500" },
  CANCELADO_FALTA:        { bg: "bg-warn-50",    text: "text-warn-700",   border: "border-warn-100",  dot: "bg-warn-500" },
  CANCELADO_ACORDADO:     { bg: "bg-brand-50",   text: "text-brand-700",  border: "border-brand-100", dot: "bg-brand-400" },
  CANCELADO_PROFISSIONAL: { bg: "bg-err-50",     text: "text-err-700",    border: "border-err-100",   dot: "bg-err-500" },
}

// Invoice pill tones — badge shape, ink/brand/ok/warn tokens.
const INVOICE_BADGE: Record<string, string> = {
  PAGO:       "bg-ok-50 text-ok-700 border-ok-100",
  ENVIADO:    "bg-brand-50 text-brand-700 border-brand-100",
  PENDENTE:   "bg-warn-50 text-warn-700 border-warn-100",
  PARCIAL:    "bg-warn-50 text-warn-700 border-warn-100",
  CANCELADO:  "bg-err-50 text-err-700 border-err-100",
}

// Initials for the header avatar — accepts patient name OR title for non-consulta entries.
function getInitials(name: string | null | undefined): string {
  if (!name) return "·"
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

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
  apiError?: string | null
  onDismissError?: () => void
  canMarkStatus: boolean
  onUpdateStatus: (status: string, message: string, reason?: string) => Promise<void>
  isUpdatingStatus: boolean
  canResendConfirmation: boolean
  onResendConfirmation: () => Promise<void>
  isResendingConfirmation: boolean
  isDeleteDialogOpen: boolean
  setIsDeleteDialogOpen: (open: boolean) => void
  isDeletingAppointment: boolean
  onDeleteAppointment: () => Promise<void>
  onToggleException: (action: "skip" | "unskip") => Promise<void>
  isManagingException: boolean
  onRecurrenceSave: () => void
  professionals?: Professional[]
  editAdditionalProfIds?: string[]
  setEditAdditionalProfIds?: (ids: string[]) => void
  onAttendingProfChange?: (professionalId: string | null) => void
  editAttendingProfId?: string | null
}

type EditorTab = "occurrence" | "recurrence" | "historico"

const STATUS_DROPDOWN_OPTIONS: Array<{ status: AppointmentStatus; label: string; message: string }> = [
  { status: "AGENDADO", label: STATUS_LABELS.AGENDADO, message: "Status alterado para agendado" },
  { status: "CONFIRMADO", label: STATUS_LABELS.CONFIRMADO, message: "Status alterado para confirmado" },
  { status: "FINALIZADO", label: STATUS_LABELS.FINALIZADO, message: "Status alterado para finalizado" },
  { status: "CANCELADO_FALTA", label: STATUS_LABELS.CANCELADO_FALTA, message: "Status alterado para falta" },
  { status: "CANCELADO_ACORDADO", label: STATUS_LABELS.CANCELADO_ACORDADO, message: "Status alterado para desmarcou" },
  { status: "CANCELADO_PROFISSIONAL", label: STATUS_LABELS.CANCELADO_PROFISSIONAL, message: "Status alterado" },
]

/** Statuses that require collecting a cancellation reason before applying. */
const STATUS_TO_CANCEL_VARIANT: Partial<Record<AppointmentStatus, CancelVariant>> = {
  CANCELADO_FALTA: "faltou",
  CANCELADO_ACORDADO: "desmarcou",
  CANCELADO_PROFISSIONAL: "sem_cobranca",
}

function StatusBadgeDropdown({
  appointment,
  canMarkStatus,
  isUpdatingStatus,
  onUpdateStatus,
  onRequestCancelConfirm,
}: {
  appointment: Appointment
  canMarkStatus: boolean
  isUpdatingStatus: boolean
  onUpdateStatus?: (status: string, message: string, reason?: string) => void
  onRequestCancelConfirm: (variant: CancelVariant) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const tone = STATUS_BADGE[appointment.status] || STATUS_BADGE.AGENDADO
  const label = STATUS_LABELS[appointment.status] || appointment.status

  // Close the popover on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const badgeClasses = `inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium border ${tone.bg} ${tone.text} ${tone.border}`

  if (!canMarkStatus || !onUpdateStatus) {
    return (
      <span className={badgeClasses}>
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
        {label}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isUpdatingStatus}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Alterar status"
        className={`${badgeClasses} hover:opacity-80 disabled:opacity-60 cursor-pointer`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
        {label}
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[200px] rounded-md border border-ink-200 bg-card shadow-lg py-1 animate-scale-in origin-top-right"
        >
          {STATUS_DROPDOWN_OPTIONS.map((opt) => {
            const optTone = STATUS_BADGE[opt.status] || STATUS_BADGE.AGENDADO
            const isCurrent = opt.status === appointment.status
            return (
              <button
                key={opt.status}
                type="button"
                role="menuitem"
                disabled={isCurrent || isUpdatingStatus}
                onClick={() => {
                  setOpen(false)
                  const cancelVariant = STATUS_TO_CANCEL_VARIANT[opt.status]
                  if (cancelVariant) {
                    onRequestCancelConfirm(cancelVariant)
                  } else {
                    onUpdateStatus(opt.status, opt.message)
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-ink-50 disabled:cursor-default ${isCurrent ? "font-semibold bg-ink-50" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full ${optTone.dot}`} aria-hidden="true" />
                <span className="flex-1 text-ink-800">{opt.label}</span>
                {isCurrent && <CheckIcon className="w-3.5 h-3.5 text-ok-500" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AppointmentEditor({
  isOpen, onClose, appointment, form, isUpdating, onSubmit,
  apiError, onDismissError, canMarkStatus, onUpdateStatus, isUpdatingStatus,
  canResendConfirmation, onResendConfirmation, isResendingConfirmation,
  isDeleteDialogOpen, setIsDeleteDialogOpen, isDeletingAppointment, onDeleteAppointment,
  onToggleException, isManagingException, onRecurrenceSave,
  professionals, editAdditionalProfIds, setEditAdditionalProfIds,
  onAttendingProfChange, editAttendingProfId,
}: AppointmentEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("occurrence")
  const [cancelVariant, setCancelVariant] = useState<CancelVariant | null>(null)
  const { canRead: canReadAudit } = usePermission("audit_logs")
  const { canRead: canReadFinances } = usePermission("finances")

  const handleClose = () => { setActiveTab("occurrence"); setCancelVariant(null); onClose() }
  if (!appointment) return null

  const isConsulta = appointment.type === "CONSULTA"
  const isRecurring = !!appointment.recurrence
  const isException = isDateException(appointment)
  const isActive = appointment.recurrence?.isActive ?? false

  const scheduled = new Date(appointment.scheduledAt)
  const end = new Date(appointment.endAt)
  const timeRange = `${formatTime(scheduled)} — ${formatTime(end)}`
  const durationMin = Math.round((end.getTime() - scheduled.getTime()) / 60000)
  const dateDisplay = formatDateDisplay(scheduled)

  const segments: Segment[] = [
    { key: "occurrence", label: isConsulta ? "Esta consulta" : "Esta entrada" },
  ]
  if (isRecurring && isActive) segments.push({ key: "recurrence", label: "Recorrencia" })
  if (canReadAudit) segments.push({ key: "historico", label: "Historico" })

  const sheetTitle = isConsulta ? "Editar Agendamento" : `Editar ${ENTRY_TYPE_LABELS[appointment.type as CalendarEntryType] || "Entrada"}`

  // Avatar: patient initials for CONSULTA, title initials for other types.
  const headerName = isConsulta ? appointment.patient?.name || "" : appointment.title || ENTRY_TYPE_LABELS[appointment.type as CalendarEntryType] || ""
  // Tabs: always show "Esta", plus Recorrência (if recurring), Histórico (if allowed),
  // and Pular (if recurring active) — as a tab rather than trailing action so mobile fits.
  type TabKey = "occurrence" | "recurrence" | "historico" | "skip"
  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode; count?: string | number }> = [
    { key: "occurrence", label: isConsulta ? "Esta consulta" : "Esta entrada", icon: <CalendarIcon className="w-3.5 h-3.5" /> },
  ]
  if (isRecurring && isActive) tabs.push({ key: "recurrence", label: "Recorrência", icon: <RefreshCwIcon className="w-3.5 h-3.5" /> })
  if (canReadAudit) tabs.push({ key: "historico", label: "Histórico", icon: <HistoryIcon className="w-3.5 h-3.5" /> })
  if (isRecurring && isActive) tabs.push({ key: "skip", label: isException ? "Pulada" : "Pular", icon: <BanIcon className="w-3.5 h-3.5" /> })
  // Segments kept for backwards-compat (SegmentedControl unused now)
  void segments

  return (
    <Sheet isOpen={isOpen} onClose={handleClose} title={sheetTitle}>
      {/* ══════════════════ Appointment Head — gradient brand-50→card ══════════════════ */}
      <div className="px-6 py-4 bg-gradient-to-b from-brand-50 to-card border-b border-ink-200">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left: avatar + name/title + contact */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 border border-brand-200 font-semibold text-[13px] grid place-items-center flex-shrink-0">
              {getInitials(headerName)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {!isConsulta && (
                  <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-700 border border-ink-200 uppercase tracking-wide">
                    {ENTRY_TYPE_LABELS[appointment.type as CalendarEntryType] || appointment.type}
                  </span>
                )}
                <h3 className="text-[16px] font-semibold text-ink-900 truncate tracking-tight">
                  {headerName || "Sem título"}
                </h3>
              </div>
              {isConsulta && appointment.patient && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-[12px] text-ink-600">
                  <a href={`tel:${appointment.patient.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand-700 transition-colors">
                    <PhoneIcon className="w-3.5 h-3.5 text-ink-400" />
                    {formatPhone(appointment.patient.phone)}
                  </a>
                  {appointment.patient.email && (
                    <a href={`mailto:${appointment.patient.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-700 transition-colors truncate max-w-[240px]">
                      <MailIcon className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                      <span className="truncate">{appointment.patient.email}</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: badges */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <StatusBadgeDropdown
              appointment={appointment}
              canMarkStatus={canMarkStatus ?? false}
              isUpdatingStatus={isUpdatingStatus ?? false}
              onUpdateStatus={onUpdateStatus}
              onRequestCancelConfirm={(variant) => setCancelVariant(variant)}
            />
            {(isConsulta || appointment.type === "REUNIAO") && appointment.invoice && (() => {
              // Render as a link only when the user can actually open the
              // invoice page — otherwise the same pill as static text.
              const badgeClass = `inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium border ${
                INVOICE_BADGE[appointment.invoice.status] || "bg-ink-100 text-ink-700 border-ink-200"
              }`
              const label = (
                <>
                  <DollarSignIcon className="w-3 h-3" />
                  {INVOICE_STATUS_LABELS[appointment.invoice.status] || appointment.invoice.status}
                  {" · "}
                  {MONTH_NAMES_SHORT[appointment.invoice.referenceMonth - 1]}/
                  {String(appointment.invoice.referenceYear).slice(-2)}
                </>
              )
              return canReadFinances ? (
                <a
                  href={`/financeiro/faturas/${appointment.invoice.id}`}
                  className={`${badgeClass} transition-opacity hover:opacity-80`}
                >
                  {label}
                </a>
              ) : (
                <span className={badgeClass}>{label}</span>
              )
            })()}
            {isRecurring && (
              <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-100">
                <RefreshCwIcon className="w-3 h-3" />
                {RECURRENCE_TYPE_LABELS[appointment.recurrence!.recurrenceType]}
                {isRecurrenceModified(appointment) && (
                  <span className="text-warn-700"> · alterado</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Meta row — date / time / duration / professional / modality */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[12px] text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-ink-400" />
            <span className="text-ink-700 font-medium font-mono tabular-nums">{dateDisplay}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon className="w-3.5 h-3.5 text-ink-400" />
            <span className="text-ink-700 font-medium font-mono tabular-nums">{timeRange}</span>
            <span className="text-ink-500">· {durationMin} min</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-ink-400" />
            {appointment.professionalProfile.user.name}
            {appointment.attendingProfessional && appointment.attendingProfessional.id !== appointment.professionalProfile.id && (
              <span className="text-brand-700">
                · atendente {appointment.attendingProfessional.user.name}
              </span>
            )}
          </span>
          {isConsulta && appointment.modality && (
            <span className="inline-flex items-center gap-1.5">
              {appointment.modality === "ONLINE" ? (
                <VideoIcon className="w-3.5 h-3.5 text-ink-400" />
              ) : (
                <BuildingIcon className="w-3.5 h-3.5 text-ink-400" />
              )}
              {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
            </span>
          )}
        </div>
      </div>

      {/* ══════════════════ Context tabs — ctx-tabs grid ══════════════════ */}
      {tabs.length > 1 && (
        <div className="px-6 pt-4">
          <div
            className="grid rounded-[4px] border border-ink-200 bg-ink-50 p-[3px] gap-0.5"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
            role="tablist"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    if (tab.key === "skip") {
                      onToggleException(isException ? "unskip" : "skip")
                    } else {
                      setActiveTab(tab.key)
                    }
                  }}
                  disabled={tab.key === "skip" && isManagingException}
                  className={`h-9 px-2 rounded-[3px] text-[12px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                    isActive
                      ? "bg-card text-brand-700 font-semibold shadow-sm"
                      : "text-ink-600 hover:text-ink-800 hover:bg-ink-100"
                  } ${tab.key === "skip" && isException ? "text-warn-700" : ""}`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Exception warning */}
      {isException && activeTab === "occurrence" && (
        <div className="mx-6 mt-4 p-3 rounded-[4px] border border-warn-100 bg-warn-50">
          <p className="text-[13px] text-warn-700">
            Esta data foi marcada como exceção (pulada). Clique em &ldquo;Pulada&rdquo; para restaurar.
          </p>
        </div>
      )}

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "occurrence" && (
          <OccurrenceTabContent
            appointment={appointment} form={form} isUpdating={isUpdating} onSubmit={onSubmit}
            apiError={apiError} onDismissError={onDismissError} onClose={handleClose}
            canMarkStatus={canMarkStatus} onUpdateStatus={onUpdateStatus} isUpdatingStatus={isUpdatingStatus}
            onRequestCancelConfirm={(variant) => setCancelVariant(variant)}
            canResendConfirmation={canResendConfirmation} onResendConfirmation={onResendConfirmation}
            isResendingConfirmation={isResendingConfirmation}
            isDeleteDialogOpen={isDeleteDialogOpen} setIsDeleteDialogOpen={setIsDeleteDialogOpen}
            isDeletingAppointment={isDeletingAppointment} onDeleteAppointment={onDeleteAppointment}
            isRecurring={isRecurring} isConsulta={isConsulta}
            professionals={professionals} editAdditionalProfIds={editAdditionalProfIds}
            setEditAdditionalProfIds={setEditAdditionalProfIds}
            onAttendingProfChange={onAttendingProfChange} editAttendingProfId={editAttendingProfId}
          />
        )}
        {activeTab === "recurrence" && (
          <RecurrenceTabContent appointment={appointment} onSave={onRecurrenceSave}
            onClose={handleClose} professionals={professionals} />
        )}
        {activeTab === "historico" && (
          <HistoryTimeline entityType="Appointment" entityId={appointment.id} />
        )}
      </div>

      {/* Cancel confirmation dialog — used by both the in-form buttons and the
          status-badge dropdown. Collects the cancellation reason before applying. */}
      {cancelVariant && onUpdateStatus && (
        <CancelConfirmDialog
          isOpen={!!cancelVariant}
          onClose={() => setCancelVariant(null)}
          variant={cancelVariant}
          onConfirm={async (status, reason) => {
            await onUpdateStatus(status, "Status alterado com sucesso", reason || undefined)
            setCancelVariant(null)
          }}
        />
      )}
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
  onUpdateStatus: (status: string, message: string, reason?: string) => Promise<void>
  onRequestCancelConfirm: (variant: CancelVariant) => void
  isUpdatingStatus: boolean
  canResendConfirmation: boolean
  onResendConfirmation: () => Promise<void>
  isResendingConfirmation: boolean
  isDeleteDialogOpen: boolean
  setIsDeleteDialogOpen: (open: boolean) => void
  isDeletingAppointment: boolean
  onDeleteAppointment: () => Promise<void>
  isRecurring: boolean
  isConsulta: boolean
  professionals?: Professional[]
  editAdditionalProfIds?: string[]
  setEditAdditionalProfIds?: (ids: string[]) => void
  onAttendingProfChange?: (professionalId: string | null) => void
  editAttendingProfId?: string | null
}

function OccurrenceTabContent({
  appointment, form, isUpdating, onSubmit, apiError, onDismissError, onClose,
  canMarkStatus, onUpdateStatus, onRequestCancelConfirm, isUpdatingStatus,
  canResendConfirmation, onResendConfirmation, isResendingConfirmation,
  isDeleteDialogOpen, setIsDeleteDialogOpen, isDeletingAppointment, onDeleteAppointment,
  isRecurring, isConsulta, professionals, editAdditionalProfIds, setEditAdditionalProfIds,
  onAttendingProfChange, editAttendingProfId,
}: OccurrenceTabContentProps) {
  const isCancelled = CANCELLED_STATUSES.includes(appointment.status)
  const isNoShow = appointment.status === "CANCELADO_FALTA"
  const isFinished = appointment.status === "FINALIZADO"
  const isTerminal = isCancelled || isNoShow || isFinished
  const hasQuickActions = !isTerminal && (canMarkStatus || canResendConfirmation)

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

      {/* ══════════════════ Status actions · cancel group · resend bar ══════════════════
         Matches the Editar Agendamento design: two hero CTAs + cancelation card + resend bar. */}
      {hasQuickActions && (
        <div className="space-y-2.5">
          {/* Section label */}
          {canMarkStatus && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              {isConsulta ? "Status da consulta" : "Status"}
            </div>
          )}

          {/* Primary hero actions — 2 buttons side by side */}
          {canMarkStatus && isConsulta && appointment.status === "AGENDADO" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateStatus("CONFIRMADO", "Consulta confirmada com sucesso")}
                disabled={isUpdatingStatus}
                className="h-11 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] inline-flex items-center justify-center gap-2 border border-brand-500 hover:bg-brand-600 hover:border-brand-600 transition-colors disabled:opacity-50"
              >
                <CheckCircleIcon className="w-4 h-4" />
                {isUpdatingStatus ? "..." : "Confirmar paciente"}
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")}
                disabled={isUpdatingStatus}
                className="h-11 rounded-[4px] bg-ok-500 text-white font-medium text-[13px] inline-flex items-center justify-center gap-2 border border-ok-500 hover:bg-ok-700 hover:border-ok-700 transition-colors disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                {isUpdatingStatus ? "..." : "Marcar como atendido"}
              </button>
            </div>
          )}

          {canMarkStatus && isConsulta && appointment.status === "CONFIRMADO" && (
            <button
              type="button"
              onClick={() => onUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")}
              disabled={isUpdatingStatus}
              className="w-full h-11 rounded-[4px] bg-ok-500 text-white font-medium text-[13px] inline-flex items-center justify-center gap-2 border border-ok-500 hover:bg-ok-700 hover:border-ok-700 transition-colors disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4" />
              {isUpdatingStatus ? "..." : "Marcar como atendido"}
            </button>
          )}

          {canMarkStatus && !isConsulta && (
            <button
              type="button"
              onClick={() => onUpdateStatus("FINALIZADO", "Entrada concluida com sucesso")}
              disabled={isUpdatingStatus}
              className="w-full h-11 rounded-[4px] bg-ok-500 text-white font-medium text-[13px] inline-flex items-center justify-center gap-2 border border-ok-500 hover:bg-ok-700 hover:border-ok-700 transition-colors disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4" />
              {isUpdatingStatus ? "..." : "Concluir"}
            </button>
          )}

          {/* Cancelation card — 3 outlined buttons with semantic tones */}
          {canMarkStatus && isConsulta && (appointment.status === "AGENDADO" || appointment.status === "CONFIRMADO") && (
            <div className="rounded-[4px] border border-ink-200 bg-card p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
                <BanIcon className="w-3.5 h-3.5 text-ink-400" />
                Cancelamento / ausência
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onRequestCancelConfirm("faltou")}
                  disabled={isUpdatingStatus}
                  className="h-9 rounded-[4px] border border-warn-100 bg-card text-warn-700 text-[12px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-warn-50 hover:border-warn-500 transition-colors disabled:opacity-50"
                >
                  <AlertTriangleIcon className="w-3.5 h-3.5" />
                  Faltou
                </button>
                <button
                  type="button"
                  onClick={() => onRequestCancelConfirm("desmarcou")}
                  disabled={isUpdatingStatus}
                  className="h-9 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[12px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 transition-colors disabled:opacity-50"
                >
                  <XIcon className="w-3.5 h-3.5" />
                  Desmarcou
                </button>
                <button
                  type="button"
                  onClick={() => onRequestCancelConfirm("sem_cobranca")}
                  disabled={isUpdatingStatus}
                  className="h-9 rounded-[4px] border border-err-100 bg-card text-err-700 text-[12px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-err-50 hover:border-err-500 transition-colors disabled:opacity-50"
                >
                  <BanIcon className="w-3.5 h-3.5" />
                  Sem cobrança
                </button>
              </div>
            </div>
          )}

          {/* Resend bar — icon on left, button on right */}
          {canResendConfirmation && (
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-[4px] border border-ink-200 bg-card">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-[4px] bg-brand-50 text-brand-600 border border-brand-100 grid place-items-center flex-shrink-0">
                  <SendIcon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-700 font-medium truncate">
                    Reenviar links de confirmação
                  </div>
                  <div className="text-[11px] text-ink-500 font-mono truncate">
                    WhatsApp · E-mail (conforme consentimento)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onResendConfirmation}
                disabled={isResendingConfirmation}
                className="h-8 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[12px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {isResendingConfirmation ? "Enviando..." : "Reenviar"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Terminal state ── */}
      {isTerminal && (
        <TerminalStateBanner
          appointment={appointment} isConsulta={isConsulta} isFinished={isFinished}
          isNoShow={isNoShow} isCancelled={isCancelled} canMarkStatus={canMarkStatus}
          isUpdatingStatus={isUpdatingStatus} onUpdateStatus={onUpdateStatus}
        />
      )}

      {/* ── Two-column edit grid: form left, live preview right.
           Same language as the Create sheet — sections on the left,
           pré-visualização on the right. ── */}
      <EditFormWithPreview
        appointment={appointment}
        form={form}
        isConsulta={isConsulta}
        isRecurring={isRecurring}
        professionals={professionals}
        editAdditionalProfIds={editAdditionalProfIds}
        setEditAdditionalProfIds={setEditAdditionalProfIds}
        editAttendingProfId={editAttendingProfId}
        onAttendingProfChange={onAttendingProfChange}
      />

      {/* ── Danger Zone ── */}
      <div className="pt-4 border-t border-ink-200">
        <button type="button" onClick={() => setIsDeleteDialogOpen(true)}
          className="w-full h-9 text-[12px] text-ink-500 hover:text-err-700 transition-colors flex items-center justify-center gap-1.5">
          <TrashIcon className="w-3.5 h-3.5" /> Excluir permanentemente
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-background rounded-2xl p-6 max-w-sm mx-4 shadow-2xl animate-scale-in relative">
            <button type="button" onClick={() => setIsDeleteDialogOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Fechar">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangleIcon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Excluir agendamento?</h3>
                <p className="text-sm text-muted-foreground mt-1">Esta acao nao pode ser desfeita. O agendamento sera permanentemente removido.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeletingAppointment}
                className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted disabled:opacity-50 transition-colors">
                Manter
              </button>
              <button type="button" onClick={onDeleteAppointment} disabled={isDeletingAppointment}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 disabled:opacity-50 transition-colors">
                {isDeletingAppointment ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Error */}
      {apiError && onDismissError && <InlineAlert message={apiError} onDismiss={onDismissError} />}

      {/* ── Footer — matches design m-foot: ink-50 strip, hint left, actions right ── */}
      <div className="-mx-6 -mb-6 mt-2 flex items-center justify-between gap-3 flex-wrap px-6 py-3.5 bg-ink-50 border-t border-ink-200">
        <div className="flex items-center gap-2 text-[12px] text-ink-500">
          <InfoIcon className="w-3.5 h-3.5" />
          {isRecurring ? (
            <span>
              Alterações aplicam-se <strong className="text-ink-700 font-medium">apenas a esta data</strong>
            </span>
          ) : (
            <span>Alterações sincronizadas com a agenda</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isUpdating}
            className="h-10 px-4 rounded-[4px] bg-brand-500 text-white font-medium text-[13px] hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
          >
            <CheckIcon className="w-4 h-4" />
            {isUpdating ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </form>
  )
}

/* Shared class strings — kept local to this file so the Edit form uses
   the same design language as the Create sheet. */
const EDIT_LABEL = "block text-[12px] font-medium text-ink-700 mb-1.5"
const EDIT_INPUT =
  "w-full h-11 md:h-10 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] disabled:bg-ink-100 disabled:text-ink-500"
const EDIT_SELECT =
  EDIT_INPUT +
  " appearance-none pr-8 bg-no-repeat bg-[right_0.6rem_center] bg-[length:12px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 20 20%22 fill=%22none%22 stroke=%22%2364748B%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 8 10 12 14 8%22/></svg>')]"
const EDIT_TEXTAREA =
  "w-full px-3 py-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] placeholder:text-ink-400 hover:border-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms] resize-none min-h-[84px]"
const EDIT_ERROR = "text-[12px] text-err-700 mt-1"

const EDIT_MODALITY_OPTIONS: SegmentedOption<"PRESENCIAL" | "ONLINE">[] = [
  { value: "PRESENCIAL", label: "Presencial", icon: <BuildingIcon className="w-3 h-3" /> },
  { value: "ONLINE", label: "Online", icon: <VideoIcon className="w-3 h-3" /> },
]

// ============================================================================
// EditFormWithPreview — 2-column layout (form left, live preview right)
// ============================================================================

const DAY_ABBR = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]
const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

function parseBrDate(value: string): Date | null {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

interface EditFormWithPreviewProps {
  appointment: Appointment
  form: UseFormReturn<EditAppointmentFormData>
  isConsulta: boolean
  isRecurring: boolean
  professionals?: Professional[]
  editAdditionalProfIds?: string[]
  setEditAdditionalProfIds?: (ids: string[]) => void
  editAttendingProfId?: string | null
  onAttendingProfChange?: (professionalId: string | null) => void
}

function EditFormWithPreview({
  appointment,
  form,
  isConsulta,
  isRecurring,
  professionals,
  editAdditionalProfIds,
  setEditAdditionalProfIds,
  editAttendingProfId,
  onAttendingProfChange,
}: EditFormWithPreviewProps) {
  const watchedDate = form.watch("date") || ""
  const watchedStartTime = form.watch("startTime") || ""
  const watchedDuration = form.watch("duration")
  const watchedModality = form.watch("modality") ?? appointment.modality ?? "PRESENCIAL"
  const watchedPrice = form.watch("price")
  const computedEndTime = calculateEndTime(watchedStartTime, watchedDuration) || ""

  const dateObj = parseBrDate(watchedDate)
  const isDateValid = !!dateObj
  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(watchedStartTime)

  const whenHeader = isDateValid
    ? `${DAY_ABBR[dateObj!.getDay()]} · ${String(dateObj!.getDate()).padStart(2, "0")} ${MONTH_ABBR[dateObj!.getMonth()]} ${dateObj!.getFullYear()}`
    : "—"

  const timeRange =
    timeValid && computedEndTime
      ? `${watchedStartTime} → ${computedEndTime}`
      : timeValid
        ? watchedStartTime
        : "—"

  const modalityLabel = watchedModality === "ONLINE" ? "Online" : "Presencial"
  const durationLabel = watchedDuration ? `${watchedDuration} min` : "—"

  const attendingProf = professionals?.find(
    (p) => p.professionalProfile?.id === editAttendingProfId
  )
  const primaryProfName =
    attendingProf?.name || appointment.professionalProfile.user.name

  const priceDisplay =
    typeof watchedPrice === "number"
      ? `R$ ${watchedPrice.toFixed(2).replace(".", ",")}`
      : typeof watchedPrice === "string" && watchedPrice
        ? `R$ ${watchedPrice}`
        : null

  const additionalAvailable = (professionals || []).filter(
    (p) =>
      p.professionalProfile?.id &&
      p.professionalProfile.id !== appointment.professionalProfile.id
  )
  const hasAdditionalSection =
    !!professionals &&
    !!editAdditionalProfIds &&
    !!setEditAdditionalProfIds &&
    (isConsulta || appointment.type === "REUNIAO") &&
    additionalAvailable.length > 0

  return (
    <div className="grid md:grid-cols-[1fr_300px] gap-6">
      {/* Left — form sections */}
      <div className="space-y-5 min-w-0">
        <EditSectionLabel>Título</EditSectionLabel>
        <div>
          <label htmlFor="editTitle" className={EDIT_LABEL}>
            {isConsulta ? "Título (opcional)" : "Título"}
          </label>
          <input
            id="editTitle"
            type="text"
            maxLength={500}
            placeholder={isConsulta ? appointment.patient?.name ?? "Sem título" : "Título"}
            {...form.register("title")}
            className={EDIT_INPUT}
          />
          {form.formState.errors.title && (
            <p className={EDIT_ERROR}>{form.formState.errors.title.message}</p>
          )}
        </div>

        <EditSectionLabel>Horário</EditSectionLabel>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-5">
            <label htmlFor="editDate" className={EDIT_LABEL}>
              Data
            </label>
            <DateInput id="editDate" {...form.register("date")} className={EDIT_INPUT} />
            {form.formState.errors.date && (
              <p className={EDIT_ERROR}>{form.formState.errors.date.message}</p>
            )}
          </div>
          <div className="col-span-6 md:col-span-3">
            <label htmlFor="editStartTime" className={EDIT_LABEL}>
              Início
            </label>
            <TimeInput
              id="editStartTime"
              placeholder="HH:MM"
              {...form.register("startTime")}
              className={EDIT_INPUT}
            />
            {form.formState.errors.startTime && (
              <p className={EDIT_ERROR}>{form.formState.errors.startTime.message}</p>
            )}
          </div>
          <div className="col-span-6 md:col-span-4">
            <label htmlFor="editDuration" className={EDIT_LABEL}>
              Duração
            </label>
            <input
              id="editDuration"
              type="number"
              {...form.register("duration", {
                setValueAs: (v) =>
                  v === "" || v === null || v === undefined || isNaN(Number(v))
                    ? undefined
                    : Number(v),
              })}
              min={15}
              max={480}
              step={5}
              className={EDIT_INPUT}
            />
            <p className="text-[11px] text-ink-500 mt-1 font-mono">
              Fim {computedEndTime || "—"}
            </p>
          </div>
        </div>

        {isConsulta && (
          <>
            <EditSectionLabel>Tipo de atendimento</EditSectionLabel>
            <div>
              <ChipField label="Modalidade">
                <Segmented<"PRESENCIAL" | "ONLINE">
                  options={EDIT_MODALITY_OPTIONS}
                  value={(form.watch("modality") as "PRESENCIAL" | "ONLINE") ?? "PRESENCIAL"}
                  onChange={(v) =>
                    form.setValue("modality", v, { shouldDirty: true, shouldValidate: true })
                  }
                  size="sm"
                  ariaLabel="Modalidade"
                />
              </ChipField>
            </div>
          </>
        )}

        {/* Cobrança + Responsável */}
        {(isConsulta ||
          (appointment.type === "REUNIAO" && professionals && professionals.length > 1)) && (
          <>
            <EditSectionLabel>
              {isConsulta ? "Cobrança e responsável" : "Responsável"}
            </EditSectionLabel>
            <div className="grid grid-cols-12 gap-4">
              {isConsulta && (
                <div
                  className={
                    professionals && professionals.length > 1
                      ? "col-span-12 md:col-span-6"
                      : "col-span-12"
                  }
                >
                  <label htmlFor="editPrice" className={EDIT_LABEL}>
                    Valor (R$)
                  </label>
                  <input
                    id="editPrice"
                    type="number"
                    step="0.01"
                    {...form.register("price", { valueAsNumber: true })}
                    placeholder="0,00"
                    className={EDIT_INPUT}
                  />
                </div>
              )}
              {professionals && professionals.length > 1 && (
                <div className={isConsulta ? "col-span-12 md:col-span-6" : "col-span-12"}>
                  <label htmlFor="editAttendingProf" className={EDIT_LABEL}>
                    Atendente
                  </label>
                  <select
                    id="editAttendingProf"
                    value={editAttendingProfId ?? ""}
                    onChange={(e) => {
                      if (onAttendingProfChange) onAttendingProfChange(e.target.value || null)
                    }}
                    className={EDIT_SELECT}
                  >
                    <option value="">
                      {appointment.professionalProfile.user.name} (titular)
                    </option>
                    {professionals
                      .filter(
                        (p) =>
                          p.professionalProfile?.id &&
                          p.professionalProfile.id !== appointment.professionalProfile.id
                      )
                      .map((p) => (
                        <option
                          key={p.professionalProfile!.id}
                          value={p.professionalProfile!.id}
                        >
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}

        {/* Equipe adicional */}
        {hasAdditionalSection && (
          <>
            <EditSectionLabel>
              Equipe adicional{" "}
              <span className="text-ink-400 font-normal normal-case tracking-normal ml-1">
                (opcional)
              </span>
            </EditSectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {additionalAvailable.map((prof) => {
                const profId = prof.professionalProfile!.id
                const checked = editAdditionalProfIds!.includes(profId)
                return (
                  <label
                    key={prof.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-[4px] border cursor-pointer transition-colors text-[13px] ${
                      checked
                        ? "border-brand-400 bg-brand-50"
                        : "border-ink-200 bg-card hover:border-ink-400 hover:bg-ink-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditAdditionalProfIds!([...editAdditionalProfIds!, profId])
                        } else {
                          setEditAdditionalProfIds!(
                            editAdditionalProfIds!.filter((x) => x !== profId)
                          )
                        }
                      }}
                      className="w-4 h-4 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
                    />
                    <span className="font-medium text-ink-800 truncate">{prof.name}</span>
                    {prof.professionalProfile?.specialty && (
                      <span className="text-[11px] text-ink-500 font-mono truncate">
                        · {prof.professionalProfile.specialty}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </>
        )}

        {/* Observações */}
        <div>
          <label htmlFor="editNotes" className={EDIT_LABEL}>
            Observações
          </label>
          <textarea
            id="editNotes"
            rows={3}
            {...form.register("notes")}
            placeholder={isConsulta ? "Notas sobre esta consulta…" : "Notas…"}
            className={EDIT_TEXTAREA}
          />
        </div>

        {isRecurring && (
          <p className="text-[12px] text-ink-500 flex items-center gap-1.5">
            <AlertTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
            Alterações aplicam-se apenas a esta data.
          </p>
        )}
      </div>

      {/* Right — live preview of the edited values */}
      <aside className="md:border-l md:pl-6 md:border-ink-200 flex flex-col gap-4 min-w-0">
        <EditSidebarLabel>Pré-visualização</EditSidebarLabel>

        <div className="px-3.5 py-3 rounded-[4px] bg-brand-500 text-white flex items-center gap-2.5">
          <CalendarIcon className="w-4 h-4 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-mono opacity-85 tracking-wider">{whenHeader}</div>
            <div className="text-[15px] font-semibold mt-0.5 tracking-tight">{timeRange}</div>
          </div>
        </div>

        <div className="bg-card rounded-[6px] border border-ink-200 shadow-sm p-4 space-y-3">
          {isConsulta && appointment.patient && (
            <EditPreviewRow
              icon={<UserIcon className="w-4 h-4" />}
              label="Paciente"
              value={appointment.patient.name}
            />
          )}
          <EditPreviewRow
            icon={<UsersIcon className="w-4 h-4" />}
            label="Profissional"
            value={primaryProfName}
          />
          {isConsulta && (
            <EditPreviewRow
              icon={
                watchedModality === "ONLINE" ? (
                  <VideoIcon className="w-4 h-4" />
                ) : (
                  <BuildingIcon className="w-4 h-4" />
                )
              }
              label="Modalidade"
              value={modalityLabel}
            />
          )}
          <EditPreviewRow
            icon={<ClockIcon className="w-4 h-4" />}
            label="Duração"
            value={durationLabel}
          />
          {isConsulta && priceDisplay && (
            <EditPreviewRow
              icon={<FileTextIcon className="w-4 h-4" />}
              label="Valor"
              value={priceDisplay}
            />
          )}
          {editAdditionalProfIds && editAdditionalProfIds.length > 0 && (
            <EditPreviewRow
              icon={<UsersIcon className="w-4 h-4" />}
              label="Equipe"
              value={`+${editAdditionalProfIds.length} ${
                editAdditionalProfIds.length === 1 ? "profissional" : "profissionais"
              }`}
            />
          )}
        </div>

        <div className="mt-auto">
          <EditSidebarLabel>Estado atual</EditSidebarLabel>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-600">
            {isDateValid && timeValid ? (
              <>
                <CheckIcon className="w-4 h-4 text-ok-500" />
                <span>Alterações prontas para salvar</span>
              </>
            ) : (
              <>
                <InfoIcon className="w-4 h-4 text-ink-400" />
                <span>Defina data e horário</span>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function EditSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
      <span>{children}</span>
      <span className="flex-1 h-px bg-ink-200" />
    </div>
  )
}

function EditSidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
      {children}
    </div>
  )
}

function EditPreviewRow({
  icon,
  label,
  value,
  placeholder = "—",
}: {
  icon: React.ReactNode
  label: string
  value?: string | null
  placeholder?: string
}) {
  const hasValue = !!value
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="text-ink-400 flex-shrink-0">{icon}</span>
      <span className="text-ink-600">{label}</span>
      <span
        className={`ml-auto truncate max-w-[60%] text-right ${
          hasValue ? "text-ink-900 font-medium" : "text-ink-400 italic"
        }`}
      >
        {hasValue ? value : placeholder}
      </span>
    </div>
  )
}

// ============================================================================
// Terminal State Banner (extracted)
// ============================================================================

function TerminalStateBanner({ appointment, isConsulta, isFinished, isNoShow, isCancelled, canMarkStatus, isUpdatingStatus, onUpdateStatus }: {
  appointment: Appointment; isConsulta: boolean; isFinished: boolean; isNoShow: boolean; isCancelled: boolean
  canMarkStatus: boolean; isUpdatingStatus: boolean
  onUpdateStatus: (status: string, message: string) => Promise<void>
}) {
  const bannerStyle = isFinished
    ? "bg-gray-50 border-gray-200 text-gray-600"
    : isNoShow
    ? "bg-amber-50 border-amber-200 text-amber-700"
    : appointment.status === "CANCELADO_ACORDADO"
    ? "bg-teal-50 border-teal-200 text-teal-700"
    : "bg-red-50 border-red-200 text-red-600"

  return (
    <div className={`p-3 rounded-xl border text-sm flex items-start gap-2.5 ${bannerStyle}`}>
      <div className="flex-shrink-0 mt-0.5">
        {isFinished ? <CheckCircleIcon className="w-4 h-4" /> : <AlertTriangleIcon className="w-4 h-4" />}
      </div>
      <div className="flex-1">
        {isFinished && "Esta consulta foi finalizada."}
        {isNoShow && "Paciente nao compareceu a esta consulta."}
        {appointment.status === "CANCELADO_ACORDADO" && (
          <>Paciente desmarcou — credito gerado.
            {appointment.cancellationReason && <span className="block mt-1 text-xs opacity-75">Motivo: {appointment.cancellationReason}</span>}
          </>
        )}
        {appointment.status === "CANCELADO_PROFISSIONAL" && (
          <>Sessao cancelada sem cobranca.
            {appointment.cancellationReason && <span className="block mt-1 text-xs opacity-75">Motivo: {appointment.cancellationReason}</span>}
          </>
        )}

        {canMarkStatus && isFinished && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => onUpdateStatus("AGENDADO", "Agendamento restaurado")} disabled={isUpdatingStatus}
              className="h-8 px-3 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 active:scale-[0.98] transition-all disabled:opacity-50">
              {isUpdatingStatus ? "..." : "Reagendar"}
            </button>
            <button type="button" onClick={() => onUpdateStatus("CONFIRMADO", "Status alterado para confirmado")} disabled={isUpdatingStatus}
              className="h-8 px-3 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 active:scale-[0.98] transition-all disabled:opacity-50">
              {isUpdatingStatus ? "..." : "Alterar para Confirmado"}
            </button>
          </div>
        )}

        {canMarkStatus && isConsulta && isCancelled && (
          <div className="mt-2 flex flex-wrap gap-2">
            {appointment.status !== "CANCELADO_FALTA" && (
              <button type="button" onClick={() => onUpdateStatus("CANCELADO_FALTA", "Status alterado para falta")} disabled={isUpdatingStatus}
                className="h-8 px-3 rounded-lg border border-amber-300 text-amber-700 text-xs font-medium hover:bg-amber-50 active:scale-[0.98] transition-all disabled:opacity-50">
                {isUpdatingStatus ? "..." : "Alterar para Falta"}
              </button>
            )}
            {appointment.status !== "CANCELADO_ACORDADO" && (
              <button type="button" onClick={() => onUpdateStatus("CANCELADO_ACORDADO", "Status alterado para desmarcou")} disabled={isUpdatingStatus}
                className="h-8 px-3 rounded-lg border border-teal-300 text-teal-700 text-xs font-medium hover:bg-teal-50 active:scale-[0.98] transition-all disabled:opacity-50">
                {isUpdatingStatus ? "..." : "Alterar para Desmarcou"}
              </button>
            )}
            {appointment.status !== "CANCELADO_PROFISSIONAL" && (
              <button type="button" onClick={() => onUpdateStatus("CANCELADO_PROFISSIONAL", "Status alterado para cancelado sem cobranca")} disabled={isUpdatingStatus}
                className="h-8 px-3 rounded-lg border border-red-300 text-red-600 text-xs font-medium hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-50">
                {isUpdatingStatus ? "..." : "Alterar para sem cobranca"}
              </button>
            )}
            <button type="button" onClick={() => onUpdateStatus("AGENDADO", "Agendamento restaurado")} disabled={isUpdatingStatus}
              className="h-8 px-3 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 active:scale-[0.98] transition-all disabled:opacity-50">
              {isUpdatingStatus ? "..." : "Reagendar"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
