interface Stats {
  total: number
  open: number
  done: number
  overdue: number
}

export function TodoStatCards({ stats }: { stats: Stats }) {
  const donePct = stats.total ? Math.round((100 * stats.done) / stats.total) : 0
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card label="Total" value={stats.total} sub="tarefas no sistema" />
      <Card label="A fazer" value={stats.open} sub="pendentes" />
      <Card
        label="Concluídas"
        value={stats.done}
        sub={`${donePct}% concluído`}
        valueClass="text-ok-700"
      />
      <Card
        label="Atrasadas"
        value={stats.overdue}
        sub="passaram da data"
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
