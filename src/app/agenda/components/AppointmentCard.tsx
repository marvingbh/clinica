"use client"

import { Card, CardContent } from "@/shared/components/ui/card"
import { RefreshCwIcon, VideoIcon, BuildingIcon, PhoneIcon } from "@/shared/components/ui/icons"
import { STATUS_LABELS, STATUS_COLORS } from "../lib/constants"
import { formatPhone } from "../lib/utils"
import type { Appointment, AppointmentStatus } from "../lib/types"

interface AppointmentCardProps {
  appointment: Appointment
  onClick: () => void
  showProfessional?: boolean
  compact?: boolean
}

function getStatusAccentColor(status: AppointmentStatus): string {
  const colors: Record<AppointmentStatus, string> = {
    AGENDADO: "bg-blue-500",
    CONFIRMADO: "bg-green-500",
    CANCELADO_PACIENTE: "bg-red-500",
    CANCELADO_PROFISSIONAL: "bg-red-500",
    NAO_COMPARECEU: "bg-yellow-500",
    FINALIZADO: "bg-gray-400",
  }
  return colors[status] || "bg-gray-400"
}

export function AppointmentCard({
  appointment,
  onClick,
  showProfessional = false,
  compact = false,
}: AppointmentCardProps) {
  const isCancelled = ["CANCELADO_PROFISSIONAL", "CANCELADO_PACIENTE"].includes(appointment.status)

  return (
    <Card
      elevation="sm"
      hoverable
      className={`group cursor-pointer overflow-hidden transition-all duration-normal active:scale-[0.98] ${
        isCancelled ? "opacity-50" : ""
      }`}
      onClick={onClick}
    >
      {/* Status accent bar */}
      <div className={`h-1 ${getStatusAccentColor(appointment.status as AppointmentStatus)}`} />

      <CardContent className={compact ? "py-3" : "py-4"}>
        {/* Professional name - prominent when viewing all */}
        {showProfessional && (
          <p className="text-xs font-semibold text-primary mb-2 truncate">
            {appointment.professionalProfile.user.name}
          </p>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {appointment.patient.name}
            </h4>
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

        {/* Meta info row */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
          {/* Modality */}
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

          {/* Recurrence indicator */}
          {appointment.recurrence && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
              <RefreshCwIcon className="w-3.5 h-3.5" />
              Recorrente
            </span>
          )}

          {/* Notes preview */}
          {appointment.notes && !compact && (
            <span className="text-xs text-muted-foreground truncate flex-1">
              {appointment.notes}
            </span>
          )}
        </div>
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
