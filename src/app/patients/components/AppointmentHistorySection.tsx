"use client"

import { Appointment, formatDateTime, statusLabels, statusColors } from "./types"

interface AppointmentHistorySectionProps {
  appointments: Appointment[]
  total: number
  statusFilter: string
  isLoadingMore: boolean
  onStatusFilterChange: (value: string) => void
  onLoadMore: () => void
}

export function AppointmentHistorySection({
  appointments,
  total,
  statusFilter,
  isLoadingMore,
  onStatusFilterChange,
  onLoadMore,
}: AppointmentHistorySectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium text-foreground">
          Historico de Consultas
        </h3>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {appointments.length} de {total}
          </span>
        )}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { value: "", label: "Todos" },
          { value: "AGENDADO", label: "Agendado" },
          { value: "CONFIRMADO", label: "Confirmado" },
          { value: "FINALIZADO", label: "Finalizado" },
          { value: "CANCELADO_ACORDADO", label: "Canc. Acordado" },
          { value: "CANCELADO_FALTA", label: "Faltou" },
          { value: "CANCELADO_PROFISSIONAL", label: "Canc. Profissional" },
        ].map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => onStatusFilterChange(filter.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === filter.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:bg-muted"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {appointments.length > 0 ? (
        <>
          <div className="space-y-3">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                className="bg-muted/50 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">
                    {formatDateTime(appointment.scheduledAt)}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColors[appointment.status] || 'bg-gray-100 text-gray-800'}`}>
                    {statusLabels[appointment.status] || appointment.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {appointment.professionalProfile.user.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                </p>
              </div>
            ))}
          </div>

          {/* Load more button */}
          {appointments.length < total && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full mt-4 h-10 rounded-lg border border-input bg-background text-sm text-muted-foreground font-medium hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
            >
              {isLoadingMore
                ? "Carregando..."
                : `Carregar mais (${total - appointments.length} restantes)`}
            </button>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {statusFilter
            ? "Nenhuma consulta com este filtro"
            : "Nenhuma consulta registrada"}
        </p>
      )}
    </div>
  )
}
