"use client"

import { useReport } from "./useReport"
import { ExportCsvButton } from "./ExportCsvButton"
import { MetricEmptyState } from "./MetricEmptyState"
import { Loading, ErrorState } from "./tab-states"
import { fmtPct, fmtNumber } from "./format"
import type { GroupsResponse } from "./types"

const EMPTY = "Nenhuma sessão de grupo neste período."

export function GruposTab({ query }: { query: string }) {
  const url = `/api/relatorios/grupos?${query}`
  const { data, loading, error } = useReport<GroupsResponse>(url)

  if (loading) return <Loading />
  if (error || !data) return <ErrorState />
  if (data.groups.length === 0) return <MetricEmptyState message={EMPTY} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Ocupação dos grupos</h3>
        <ExportCsvButton apiUrl={url} />
      </div>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Grupo</th>
              <th className="px-3 py-2 font-medium">Profissional</th>
              <th className="px-3 py-2 font-medium text-right">Sessões</th>
              <th className="px-3 py-2 font-medium text-right">Média de presentes</th>
              <th className="px-3 py-2 font-medium text-right">Capacidade</th>
              <th className="px-3 py-2 font-medium text-right">Ocupação</th>
              <th className="px-3 py-2 font-medium text-right">Faltas</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((g) => (
              <tr key={g.groupId} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-foreground">{g.groupName}</td>
                <td className="px-3 py-2 text-muted-foreground">{g.professionalName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{g.sessions === 0 ? "—" : fmtNumber(g.sessions)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(g.avgPresent, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums" title="Capacidade definida no grupo ou nº de membros ativos (fallback)">
                  {g.capacity || "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(g.occupancyPct)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(g.faltas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
