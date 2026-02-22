"use client"

import { Card, CardContent } from "@/shared/components/ui/card"
import { RefreshCwIcon, VideoIcon, BuildingIcon, PhoneIcon, ArrowLeftRightIcon } from "@/shared/components/ui/icons"
import { STATUS_LABELS, STATUS_COLORS, ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from "../lib/constants"
import { formatPhone, isBirthdayToday, isRecurrenceModified } from "../lib/utils"
import type { Appointment, AppointmentStatus, CalendarEntryType } from "../lib/types"
import { getProfessionalColor, ProfessionalColorMap, PROFESSIONAL_COLORS } from "../lib/professional-colors"

interface AppointmentCardProps {
  appointment: Appointment
  onClick: () => void
  onAlternateWeekClick?: (appointment: Appointment) => void
  showProfessional?: boolean
  compact?: boolean
  professionalColorMap?: ProfessionalColorMap
}

function getStatusAccentColor(status: AppointmentStatus): string {
  const colors: Record<AppointmentStatus, string> = {
    AGENDADO: "bg-blue-500",
    CONFIRMADO: "bg-green-500",
    CANCELADO_ACORDADO: "bg-red-500",
    CANCELADO_FALTA: "bg-yellow-500",
    CANCELADO_PROFISSIONAL: "bg-red-500",
    FINALIZADO: "bg-gray-400",
  }
  return colors[status] || "bg-gray-400"
}

export function AppointmentCard({
  appointment,
  onClick,
  onAlternateWeekClick,
  showProfessional = false,
  compact = false,
  professionalColorMap,
}: AppointmentCardProps) {
  const isCancelled = ["CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO", "CANCELADO_FALTA"].includes(appointment.status)
  const isConsulta = appointment.type === "CONSULTA"

  // Get professional color from map when showing all professionals
  const colors = showProfessional && professionalColorMap
    ? getProfessionalColor(appointment.professionalProfile.id, professionalColorMap)
    : PROFESSIONAL_COLORS[0]

  // Entry type colors for non-patient entries
  const entryColors = !isConsulta ? ENTRY_TYPE_COLORS[appointment.type as CalendarEntryType] : null

  return (
    <Card
      elevation="sm"
      hoverable
      className={`group cursor-pointer overflow-hidden transition-all duration-normal active:scale-[0.98] ${
        isCancelled ? "opacity-50" : ""
      } ${!appointment.blocksTime ? "border-dashed" : ""} ${
        showProfessional && isConsulta ? `${colors.bg} border-l-[3px] ${colors.border}` : ""
      } ${entryColors ? `${entryColors.bg} border ${entryColors.border}` : ""}`}
      onClick={onClick}
    >
      {/* Status accent bar */}
      <div className={`h-1 ${entryColors ? entryColors.accent : showProfessional ? colors.accent : getStatusAccentColor(appointment.status as AppointmentStatus)}`} />

      <CardContent className={compact ? "py-3" : "py-4"}>
        {/* Professional name - prominent when viewing all */}
        {showProfessional && (
          <p className={`text-xs font-semibold mb-2 truncate ${professionalColorMap ? colors.text : "text-primary"}`}>
            {appointment.professionalProfile.user.name}
          </p>
        )}

        {isConsulta && appointment.patient ? (
          <>
            {/* CONSULTA layout - existing behavior */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {appointment.patient.name}
                  {isBirthdayToday(appointment.patient.birthDate) && (
                    <span className="ml-1.5 text-sm" title="Aniversario hoje!">🎂</span>
                  )}
                </h4>
                {appointment.patient.motherName && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    Mãe: {appointment.patient.motherName}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <PhoneIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground truncate">
                    {formatPhone(appointment.patient.phone)}
                  </p>
                </div>
              </div>
              <span
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
                  STATUS_COLORS[appointment.status as AppointmentStatus] || "bg-gray-100 text-gray-800"
                }`}
              >
                {STATUS_LABELS[appointment.status as AppointmentStatus] || appointment.status}
              </span>
            </div>

            {/* Notes - shown prominently if present */}
            {appointment.notes && !compact && (
              <p className="mt-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1.5 rounded-md line-clamp-2">
                {appointment.notes.length > 80
                  ? `${appointment.notes.slice(0, 80)}...`
                  : appointment.notes}
              </p>
            )}

            {/* Meta info row */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
              {/* Modality */}
              {appointment.modality && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${
                  appointment.modality === "ONLINE"
                    ? "bg-info/10 text-info"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {appointment.modality === "ONLINE" ? (
                    <VideoIcon className="w-3.5 h-3.5" />
                  ) : (
                    <BuildingIcon className="w-3.5 h-3.5" />
                  )}
                  {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                </span>
              )}

              {/* Recurrence indicator */}
              {appointment.recurrence && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <RefreshCwIcon className="w-3.5 h-3.5" />
                  {appointment.recurrence.recurrenceType === "WEEKLY" ? "Semanal" :
                   appointment.recurrence.recurrenceType === "BIWEEKLY" ? "Quinzenal" : "Mensal"}
                  {isRecurrenceModified(appointment) && (
                    <span className="text-amber-600 dark:text-amber-400"> · alterado</span>
                  )}
                </span>
              )}
            </div>

            {/* Alternate week info for biweekly appointments */}
            {appointment.recurrence?.recurrenceType === "BIWEEKLY" && appointment.alternateWeekInfo && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onAlternateWeekClick?.(appointment)
                }}
                className="mt-2 w-full text-left px-2 py-1.5 bg-purple-50 dark:bg-purple-950/30 rounded-md border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors"
              >
                <p className="text-xs text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <ArrowLeftRightIcon className="w-3 h-3" />
                  <span className="font-medium">Semana alternada:</span>
                  {appointment.alternateWeekInfo.pairedPatientName ? (
                    <span className="underline">{appointment.alternateWeekInfo.pairedPatientName}</span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400 underline">Disponivel - Agendar</span>
                  )}
                </p>
              </button>
            )}
          </>
        ) : (
          <>
            {/* Non-patient entry layout */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${entryColors ? `${entryColors.bg} ${entryColors.text} border ${entryColors.border}` : "bg-muted text-muted-foreground"}`}>
                    {ENTRY_TYPE_LABELS[appointment.type as CalendarEntryType] || appointment.type}
                  </span>
                </div>
                <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {appointment.title || "Sem titulo"}
                </h4>
              </div>
              <span
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
                  STATUS_COLORS[appointment.status as AppointmentStatus] || "bg-gray-100 text-gray-800"
                }`}
              >
                {STATUS_LABELS[appointment.status as AppointmentStatus] || appointment.status}
              </span>
            </div>

            {/* Notes for non-patient entries */}
            {appointment.notes && !compact && (
              <p className="mt-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1.5 rounded-md line-clamp-2">
                {appointment.notes.length > 80
                  ? `${appointment.notes.slice(0, 80)}...`
                  : appointment.notes}
              </p>
            )}

            {/* Recurrence indicator for non-patient entries */}
            {appointment.recurrence && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <RefreshCwIcon className="w-3.5 h-3.5" />
                  Semanal
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function AppointmentCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card elevation="sm" className="overflow-hidden">
      {/* Status accent bar skeleton */}
      <div className="h-1 bg-muted animate-pulse" />

      <CardContent className={compact ? "py-3" : "py-4"}>
        <div className="animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-3/4 bg-muted rounded" />
              <div className="h-4 w-1/2 bg-muted rounded" />
            </div>
            <div className="h-6 w-20 bg-muted rounded-full" />
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
            <div className="h-6 w-24 bg-muted rounded-lg" />
            <div className="h-4 w-16 bg-muted rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
