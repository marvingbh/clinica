interface Stats {
  total: number
  olderThan7d: number
  olderThan30d: number
}

export function PendenciasStatCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Card label="Pendentes" value={stats.total} sub="aguardando finalização" />
      <Card
        label="Mais de 7 dias"
        value={stats.olderThan7d}
        sub="acumulando"
        valueClass="text-warn-700"
      />
      <Card
        label="Mais de 30 dias"
        value={stats.olderThan30d}
        sub="urgente revisar"
        valueClass="text-err-700"
      />
    </div>
  )
}

function Card({
  label,
  value,
  sub,
  valueClass = "text-ink-900",
}: {
  label: string
  value: number
  sub: string
  valueClass?: string
}) {
  return (
    <div className="rounded-[10px] border border-ink-200 bg-card px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
        {label}
      </div>
      <div className={`mt-1 text-[26px] font-bold tracking-[-0.01em] leading-none ${valueClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-ink-500 mt-1">{sub}</div>
    </div>
  )
}
