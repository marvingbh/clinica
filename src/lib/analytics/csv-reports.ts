import { toCsvBr } from "./csv"
import type { OverviewResult } from "./fetch-overview"
import type { CancellationsPayload } from "./fetch-cancellations"
import type { RetentionPayload } from "./fetch-retention"
import type { AcquisitionReport } from "./acquisition"
import type { GroupRow } from "./fetch-groups"
import { REFERRAL_SOURCE_LABELS } from "./acquisition"

function pct(n: number | null): string | null {
  return n == null ? null : `${(n * 100).toFixed(1).replace(".", ",")}%`
}

function hours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10
}

export function overviewCsv(data: OverviewResult): string {
  const headers = [
    "Profissional", "Horas disponíveis", "Horas agendadas", "Ocupação",
    "Sessões", "Cancel. (Acordado)", "Cancel. (Falta)", "Cancel. (Profissional)",
    "% Cancelamento", "Reagendamento 7d", "Receita", "Ticket médio",
  ]
  const rows = data.professionals.map((p) => [
    p.name,
    hours(p.availableMinutes),
    hours(p.bookedMinutes),
    pct(p.occupancy) ?? "n/d",
    p.sessions,
    p.cancellations.CANCELADO_ACORDADO,
    p.cancellations.CANCELADO_FALTA,
    p.cancellations.CANCELADO_PROFISSIONAL,
    pct(p.cancellationRate),
    pct(p.rebooking7) ?? "—",
    p.revenue == null ? "—" : p.revenue,
    p.avgTicket == null ? "—" : p.avgTicket,
  ])
  return toCsvBr(headers, rows)
}

export function cancellationsCsv(data: CancellationsPayload): string {
  const headers = [
    "Profissional", "Total", "Cancelamentos", "% Cancelamento",
    "Acordado", "Falta", "Profissional",
  ]
  const rows = data.byProfessional.map((p) => [
    p.name,
    p.total,
    p.cancelled,
    pct(p.rate),
    p.byStatus.CANCELADO_ACORDADO,
    p.byStatus.CANCELADO_FALTA,
    p.byStatus.CANCELADO_PROFISSIONAL,
  ])
  return toCsvBr(headers, rows)
}

export function retentionCsv(data: RetentionPayload): string {
  const headers = ["Paciente", "Última sessão", "Profissional de referência"]
  const rows = data.dropped_list.map((d) => [
    d.name,
    d.lastSessionAt ? new Date(d.lastSessionAt).toLocaleDateString("pt-BR") : "—",
    d.referenceProfessionalName ?? "—",
  ])
  return toCsvBr(headers, rows)
}

export function originsCsv(data: AcquisitionReport): string {
  const headers = ["Origem", "Pacientes novos", "Converteram", "% Conversão"]
  const rows = data.bySource.map((s) => [
    REFERRAL_SOURCE_LABELS[s.source] ?? s.source,
    s.count,
    s.converted,
    pct(s.conversionPct) ?? "—",
  ])
  return toCsvBr(headers, rows)
}

export function groupsCsv(rows: GroupRow[]): string {
  const headers = [
    "Grupo", "Profissional", "Sessões", "Média de presentes",
    "Capacidade", "Ocupação", "Faltas",
  ]
  const csvRows = rows.map((g) => [
    g.groupName,
    g.professionalName,
    g.sessions,
    Math.round(g.avgPresent * 10) / 10,
    g.capacity || "—",
    pct(g.occupancyPct) ?? "n/d",
    g.faltas,
  ])
  return toCsvBr(headers, csvRows)
}
