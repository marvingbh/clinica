"use client"

import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { InsightsData, MetricCard } from "./dashboard-shared"

interface Props {
  data: InsightsData
}

export function InsightsAtendimento({ data }: Props) {
  const { ticketMedio: ticket, cancelamento: cancel, receitaPorDia: weekday } = data
  const cancelRatePct = (cancel.cancellationRate * 100).toFixed(1)

  return (
    <div className="space-y-6">
      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Ticket Médio por Sessão"
          value={formatCurrencyBRL(ticket.avgTicket)}
          sub="valor médio cobrado por sessão"
        />
        <MetricCard
          label="Taxa de Cancelamento"
          value={`${cancelRatePct}%`}
          sub={`${cancel.cancelledCount} de ${cancel.totalAppointments} consultas`}
          detail={
            Number(cancelRatePct) > 15
              ? <span className="text-xs text-red-600 dark:text-red-400">Acima do ideal (&lt;15%)</span>
              : <span className="text-xs text-green-600 dark:text-green-400">Dentro do esperado</span>
          }
        />
        <MetricCard
          label="Faltas"
          value={String(cancel.faltaCount)}
          sub={`de ${cancel.totalAppointments} consultas no período`}
        />
      </div>

      {/* Ticket Médio por Profissional */}
      {ticket.avgTicketByProfessional.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Ticket Médio por Profissional</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium">Profissional</th>
                  <th className="text-right py-3 px-4 font-medium">Ticket Médio</th>
                  <th className="text-right py-3 px-4 font-medium">vs Média</th>
                </tr>
              </thead>
              <tbody>
                {ticket.avgTicketByProfessional.map(p => {
                  const diff = ticket.avgTicket > 0
                    ? ((p.avgTicket - ticket.avgTicket) / ticket.avgTicket * 100).toFixed(1)
                    : "0.0"
                  const diffNum = Number(diff)
                  return (
                    <tr key={p.professionalId} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">{p.name}</td>
                      <td className="text-right py-3 px-4">{formatCurrencyBRL(p.avgTicket)}</td>
                      <td className={`text-right py-3 px-4 text-sm ${
                        diffNum > 0 ? "text-green-600 dark:text-green-400"
                        : diffNum < 0 ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                      }`}>
                        {diffNum > 0 ? "+" : ""}{diff}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sessões por Dia da Semana */}
      {weekday.some(d => d.sessions > 0) && (
        <div className="p-4 rounded-lg border border-border">
          <h3 className="text-sm font-semibold mb-4">Sessões por Dia da Semana</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weekday.filter(d => d.sessions > 0)} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
              <Tooltip formatter={(value) => [`${value} sessões`, "Sessões"]} />
              <Bar dataKey="sessions" name="Sessões" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
