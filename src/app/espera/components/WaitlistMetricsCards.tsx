"use client"

interface Metrics {
  waiting: number
  avgWaitDays: number
  offersSent30d: number
  conversionRate: number
  revenueRecovered: number
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function WaitlistMetricsCards({ metrics }: { metrics: Metrics | null }) {
  const cards: { label: string; value: string }[] = [
    { label: "Aguardando", value: metrics ? String(metrics.waiting) : "—" },
    {
      label: "Tempo médio de espera",
      value: metrics ? `${metrics.avgWaitDays} dia${metrics.avgWaitDays === 1 ? "" : "s"}` : "—",
    },
    { label: "Ofertas enviadas (30 dias)", value: metrics ? String(metrics.offersSent30d) : "—" },
    {
      label: "Taxa de conversão",
      value: metrics ? `${Math.round(metrics.conversionRate * 100)}%` : "—",
    },
    { label: "Receita recuperada (est.)", value: metrics ? brl(metrics.revenueRecovered) : "—" },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="text-xl font-semibold text-foreground mt-1">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
