"use client"

import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { InsightsData, MetricCard, DeltaIndicator } from "./dashboard-shared"

interface Props {
  data: InsightsData
}

export function InsightsCobranca({ data }: Props) {
  const { inadimplencia: inad, tempoRecebimento: tempo, comparativo: comp } = data
  const overdueRatePct = (inad.overdueRate * 100).toFixed(1)

  const collectionDelta = tempo.avgCollectionDays !== null && tempo.prevAvgCollectionDays !== null
    ? tempo.avgCollectionDays - tempo.prevAvgCollectionDays
    : null

  return (
    <div className="space-y-6">
      {/* Inadimplência */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Inadimplência</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Taxa de Inadimplência"
            value={`${overdueRatePct}%`}
            sub={`${inad.overdueCount} faturas vencidas`}
            detail={
              Number(overdueRatePct) > 10
                ? <span className="text-xs text-red-600 dark:text-red-400">Acima do ideal (&lt;10%)</span>
                : <span className="text-xs text-green-600 dark:text-green-400">Dentro do esperado</span>
            }
          />
          <MetricCard
            label="Valor em Atraso"
            value={formatCurrencyBRL(inad.overdueAmount)}
            sub="total de faturas vencidas não pagas"
          />
          <MetricCard
            label="Faturas Vencidas"
            value={String(inad.overdueCount)}
            sub="com status 'Enviado' e data vencida"
          />
        </div>
      </div>

      {/* Tempo de Recebimento */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Tempo Médio de Recebimento</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            label="Período Atual"
            value={tempo.avgCollectionDays !== null ? `${tempo.avgCollectionDays} dias` : "—"}
            sub="média entre criação e pagamento"
            detail={collectionDelta !== null && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">vs anterior:</span>
                <span className={collectionDelta > 0 ? "text-red-600 dark:text-red-400" : collectionDelta < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                  {collectionDelta > 0 ? "+" : ""}{collectionDelta.toFixed(1)} dias
                </span>
              </div>
            )}
          />
          <MetricCard
            label="Período Anterior"
            value={tempo.prevAvgCollectionDays !== null ? `${tempo.prevAvgCollectionDays} dias` : "—"}
            sub="para comparação"
          />
        </div>
      </div>

      {/* Comparativo */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Comparativo com Período Anterior</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Faturado</div>
            <div className="text-lg font-bold mt-1">{formatCurrencyBRL(comp.prevFaturado)}</div>
            <div className="text-xs text-muted-foreground">período anterior</div>
            <div className="mt-2">
              <DeltaIndicator value={comp.deltaFaturado} />
            </div>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Recebido</div>
            <div className="text-lg font-bold mt-1">{formatCurrencyBRL(comp.prevPago)}</div>
            <div className="text-xs text-muted-foreground">período anterior</div>
            <div className="mt-2">
              <DeltaIndicator value={comp.deltaPago} />
            </div>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Sessões</div>
            <div className="text-lg font-bold mt-1">{comp.prevSessions}</div>
            <div className="text-xs text-muted-foreground">período anterior</div>
            <div className="mt-2">
              <DeltaIndicator value={comp.deltaSessions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
