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
  paidExpenses?: number
  formatCurrency: (value: number) => string
}

export function ProjectionBreakdown({
  revenueProjection, taxEstimate, projectedExpenses, paidExpenses = 0, formatCurrency,
}: ProjectionBreakdownProps) {
  const totalRevenue = revenueProjection.actualRevenue + revenueProjection.projectedRevenue
  const totalExpenses = paidExpenses + projectedExpenses
  const clinicSurplus = totalRevenue - totalExpenses - (taxEstimate?.totalTax ?? 0) - revenueProjection.totalEstimatedRepasse

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Receita Recebida */}
        <div className="rounded-lg border p-4 space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Receita Recebida</h3>
          <p className="text-xl font-bold text-green-600">{formatCurrency(revenueProjection.actualRevenue)}</p>
        </div>

        {/* Receita Projetada */}
        <div className="rounded-lg border p-4 space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Receita Projetada</h3>
          <p className="text-xl font-bold text-green-500">{formatCurrency(revenueProjection.projectedRevenue)}</p>
          <p className="text-[10px] text-muted-foreground">{revenueProjection.totalAppointments} sessões · canc. {(revenueProjection.cancellationRate * 100).toFixed(0)}%</p>
        </div>

        {/* Despesas Executadas */}
        <div className="rounded-lg border p-4 space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Despesas Executadas</h3>
          <p className="text-xl font-bold text-red-600">{formatCurrency(paidExpenses)}</p>
        </div>

        {/* Despesas Projetadas */}
        <div className="rounded-lg border p-4 space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Despesas Projetadas</h3>
          <p className="text-xl font-bold text-red-500">{formatCurrency(projectedExpenses)}</p>
          <p className="text-[10px] text-muted-foreground">Abertas + recorrentes</p>
        </div>

        {/* Impostos */}
        {taxEstimate && taxEstimate.totalTax > 0 && (
          <div className="rounded-lg border p-4 space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground">Impostos Estimados</h3>
            <p className="text-xl font-bold text-red-600">{formatCurrency(taxEstimate.totalTax)}</p>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <p>{taxEstimate.regime}</p>
              {taxEstimate.monthlyTotal > 0 && <p>Mensal: {formatCurrency(taxEstimate.monthlyTotal)}</p>}
              {taxEstimate.quarterlyDueThisMonth && taxEstimate.quarterlyTotal > 0 && (
                <p>Trimestral: {formatCurrency(taxEstimate.quarterlyTotal)}</p>
              )}
            </div>
          </div>
        )}

        {/* Repasse */}
        <div className="rounded-lg border p-4 space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Repasse</h3>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(revenueProjection.totalEstimatedRepasse)}</p>
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
