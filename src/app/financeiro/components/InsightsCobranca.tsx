"use client"

import { formatCurrencyBRL } from "@/lib/financeiro/format"
import {
  AreaChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { InsightsData, MetricCard, DeltaIndicator, CHART_COLORS } from "./dashboard-shared"

interface PaymentDay {
  day: number
  amount: number
  count: number
  cumulative: number
}

interface Props {
  data: InsightsData
  paymentsByDay?: PaymentDay[]
}

export function InsightsCobranca({ data, paymentsByDay }: Props) {
  const { inadimplencia: inad, pagamentoAtraso: atraso, tempoRecebimento: tempo, comparativo: comp } = data
  const unpaidRatePct = (inad.unpaidRate * 100).toFixed(1)
  const lateRatePct = (atraso.lateRate * 100).toFixed(1)

  const collectionDelta = tempo.avgCollectionDays !== null && tempo.prevAvgCollectionDays !== null
    ? tempo.avgCollectionDays - tempo.prevAvgCollectionDays
    : null

  const hasPayments = paymentsByDay && paymentsByDay.some(d => d.amount > 0)

  return (
    <div className="space-y-6">
      {/* Recebimentos por Dia */}
      {hasPayments && (
        <div className="p-4 rounded-lg border border-border">
          <h3 className="text-sm font-semibold mb-4">Recebimentos por Dia</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={paymentsByDay}>
              <defs>
                <linearGradient id="gradCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.pago} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART_COLORS.pago} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
              <Tooltip content={<PaymentDayTooltip />} />
              <Bar dataKey="amount" fill={CHART_COLORS.pago} radius={[3, 3, 0, 0]} name="Recebido no dia" />
              <Area type="monotone" dataKey="cumulative" stroke={CHART_COLORS.pago} fill="url(#gradCumulative)" strokeWidth={2} name="Acumulado" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Inadimplência */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Inadimplência no Período</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Faturas Não Pagas"
            value={`${unpaidRatePct}%`}
            sub={`${inad.unpaidCount} faturas em aberto`}
            detail={
              Number(unpaidRatePct) > 20
                ? <span className="text-xs text-red-600 dark:text-red-400">Acima do ideal (&lt;20%)</span>
                : <span className="text-xs text-green-600 dark:text-green-400">Dentro do esperado</span>
            }
          />
          <MetricCard
            label="Valor em Aberto"
            value={formatCurrencyBRL(inad.unpaidAmount)}
            sub="total de faturas não recebidas no período"
          />
          <MetricCard
            label="Pagamento em Atraso"
            value={`${lateRatePct}%`}
            sub={`${atraso.lateCount} de ${atraso.totalPaid} pagas após o vencimento`}
            detail={atraso.avgDaysLate > 0 && (
              <span className="text-xs text-orange-600 dark:text-orange-400">
                Média de {atraso.avgDaysLate} dias de atraso
              </span>
            )}
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
            <div className="mt-2"><DeltaIndicator value={comp.deltaFaturado} /></div>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Recebido</div>
            <div className="text-lg font-bold mt-1">{formatCurrencyBRL(comp.prevPago)}</div>
            <div className="text-xs text-muted-foreground">período anterior</div>
            <div className="mt-2"><DeltaIndicator value={comp.deltaPago} /></div>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Sessões</div>
            <div className="text-lg font-bold mt-1">{comp.prevSessions}</div>
            <div className="text-xs text-muted-foreground">período anterior</div>
            <div className="mt-2"><DeltaIndicator value={comp.deltaSessions} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PaymentDayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const dayData = payload[0]?.payload
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">Dia {label}</p>
      {dayData?.amount > 0 && (
        <p className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Recebido:</span>
          <span className="font-medium">{formatCurrencyBRL(dayData.amount)}</span>
          <span className="text-muted-foreground text-xs">({dayData.count} fatura{dayData.count !== 1 ? "s" : ""})</span>
        </p>
      )}
      {dayData?.cumulative > 0 && (
        <p className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-green-500 bg-transparent" />
          <span className="text-muted-foreground">Acumulado:</span>
          <span className="font-medium">{formatCurrencyBRL(dayData.cumulative)}</span>
        </p>
      )}
    </div>
  )
}
