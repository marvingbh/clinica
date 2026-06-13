"use client"

import { KPI, KPIGrid } from "@/shared/components/ui/kpi"
import { useReport } from "./useReport"
import { ExportCsvButton } from "./ExportCsvButton"
import { MetricEmptyState } from "./MetricEmptyState"
import { Loading, ErrorState } from "./tab-states"
import { fmtPct, fmtNumber, fmtBrDate } from "./format"
import type { RetentionResponse } from "./types"

const EMPTY =
  "Ainda não há pacientes novos neste período. A retenção mostra quantos pacientes voltam para a 2ª e a 5ª sessão — o melhor indicador de qualidade clínica."

export function RetencaoTab({ query }: { query: string }) {
  const url = `/api/relatorios/retencao?${query}`
  const { data, loading, error } = useReport<RetentionResponse>(url)

  if (loading) return <Loading />
  if (error || !data) return <ErrorState />
  if (data.cohortSize === 0 && data.dropped === 0 && data.active60 === 0) {
    return <MetricEmptyState message={EMPTY} />
  }

  return (
    <div className="space-y-6">
      {data.smallSample && (
        <div className="text-sm rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2">
          Amostra pequena — interprete com cautela.
        </div>
      )}

      <KPIGrid>
        <KPI label="Chegam à 2ª sessão" value={fmtPct(data.reached2ndPct)} />
        <KPI label="Chegam à 5ª sessão" value={fmtPct(data.reached5thPct)} />
        <KPI label="Sessões por paciente (média)" value={fmtNumber(data.avgSessionsPerPatient, 1)} />
        <KPI label="Vida mediana (sessões)" value={fmtNumber(data.medianLifetimeSessions, 1)} />
      </KPIGrid>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPI label="Ativos (30 dias)" value={fmtNumber(data.active30)} />
        <KPI label="Ativos (60 dias)" value={fmtNumber(data.active60)} />
        <KPI label="Sem retorno" value={fmtNumber(data.dropped)} />
      </div>

      {data.dropped_list.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Pacientes sem retorno</h3>
            <ExportCsvButton apiUrl={url} />
          </div>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Paciente</th>
                  <th className="px-3 py-2 font-medium">Última sessão</th>
                  <th className="px-3 py-2 font-medium">Profissional de referência</th>
                </tr>
              </thead>
              <tbody>
                {data.dropped_list.map((p) => (
                  <tr key={p.patientId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-foreground">{p.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtBrDate(p.lastSessionAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.referenceProfessionalName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
