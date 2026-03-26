interface RevenueProjection {
  totalAppointments: number
  grossRevenue: number
  cancellationRate: number
  projectedRevenue: number
  totalEstimatedRepasse: number
  actualRevenue: number
}

interface TaxEstimate {
  regime: string
  totalTax: number
  effectiveRate: number
  monthlyTotal: number
  quarterlyTotal: number
  quarterlyDueThisMonth: boolean
  nextQuarterlyDueMonth?: number
  breakdown: { name: string; amount: number; rate: number; period: string }[]
}

interface ProjectionBreakdownProps {
  revenueProjection: RevenueProjection
  taxEstimate: TaxEstimate | null
  projectedExpenses: number
  formatCurrency: (value: number) => string
}

export function ProjectionBreakdown({
  revenueProjection, taxEstimate, projectedExpenses, formatCurrency,
}: ProjectionBreakdownProps) {
  const clinicSurplus =
    revenueProjection.projectedRevenue -
    projectedExpenses -
    (taxEstimate?.totalTax ?? 0) -
    revenueProjection.totalEstimatedRepasse

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Receita */}
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="text-sm font-medium">Receita do Mês</h3>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency((revenueProjection.actualRevenue ?? 0) + revenueProjection.projectedRevenue)}
          </p>
          <div className="text-xs text-muted-foreground space-y-1">
            {revenueProjection.actualRevenue > 0 && (
              <p>Recebido até hoje: {formatCurrency(revenueProjection.actualRevenue)}</p>
            )}
            <p>Projetado restante: {formatCurrency(revenueProjection.projectedRevenue)}</p>
            <p>{revenueProjection.totalAppointments} sessões futuras agendadas</p>
            <p>Taxa de cancelamento: {(revenueProjection.cancellationRate * 100).toFixed(1)}%</p>
          </div>
        </div>

        {/* Despesas */}
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="text-sm font-medium">Despesas Projetadas</h3>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(projectedExpenses)}</p>
          <div className="text-xs text-muted-foreground">
            <p>Despesas abertas + recorrentes</p>
          </div>
        </div>

        {/* Impostos */}
        {taxEstimate && taxEstimate.totalTax > 0 && (
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-medium">Impostos Estimados</h3>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(taxEstimate.totalTax)}</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Regime: {taxEstimate.regime}</p>
              <p className="font-medium mt-1">Mensais: {formatCurrency(taxEstimate.monthlyTotal)}</p>
              {taxEstimate.breakdown.filter(b => b.period === "mensal").map((b) => (
                <p key={b.name} className="ml-2">{b.name}: {formatCurrency(b.amount)}</p>
              ))}
              {taxEstimate.quarterlyDueThisMonth ? (
                <>
                  <p className="font-medium mt-1">Trimestrais (vence este mês): {formatCurrency(taxEstimate.quarterlyTotal)}</p>
                  {taxEstimate.breakdown.filter(b => b.period === "trimestral").map((b) => (
                    <p key={b.name} className="ml-2">{b.name}: {formatCurrency(b.amount)}</p>
                  ))}
                </>
              ) : taxEstimate.nextQuarterlyDueMonth ? (
                <p className="mt-1">IRPJ + CSLL: próximo vencimento em {
                  ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                   "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][taxEstimate.nextQuarterlyDueMonth]
                }</p>
              ) : null}
            </div>
          </div>
        )}

        {/* Repasse */}
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="text-sm font-medium">Repasse Estimado</h3>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(revenueProjection.totalEstimatedRepasse)}</p>
        </div>
      </div>

      {/* Sobra clínica */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex justify-between items-center">
        <span className="text-sm font-medium">Sobra clínica estimada</span>
        <span className={`text-xl font-bold ${clinicSurplus >= 0 ? "text-green-600" : "text-red-600"}`}>
          {formatCurrency(clinicSurplus)}
        </span>
      </div>
    </div>
  )
}
