/* Matches the "Revenue · last 12 weeks" SVG in the design system dashboard:
   brand-500 line over a gradient fill with horizontal grid lines and a
   highlighted trailing point. Fully responsive via preserveAspectRatio. */

export type RevenueGranularity = "day" | "week" | "month"

export interface RevenuePoint {
  bucketStart: string
  total: number
}

interface RevenueChartProps {
  data: RevenuePoint[]
  granularity?: RevenueGranularity
  className?: string
}

export function RevenueChart({
  data,
  granularity = "week",
  className = "",
}: RevenueChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={`h-[200px] flex items-center justify-center text-xs text-ink-400 font-mono ${className}`}
      >
        Sem dados
      </div>
    )
  }

  const W = 600
  const H = 200
  const PAD_TOP = 10
  const PAD_BOT = 25
  const max = Math.max(...data.map((d) => d.total), 1)

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * W
    const normalized = max === 0 ? 0 : d.total / max
    const y = PAD_TOP + (H - PAD_TOP - PAD_BOT) * (1 - normalized)
    return { x, y, total: d.total, bucketStart: d.bucketStart }
  })

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`
  const last = points[points.length - 1]
  const secondLast = points[points.length - 2]

  // Tick labels at first + ~quartile points + last; number depends on series length.
  const tickCount = Math.min(5, data.length)
  const tickIndices: number[] = []
  for (let i = 0; i < tickCount; i++) {
    tickIndices.push(Math.round((i * (data.length - 1)) / (tickCount - 1 || 1)))
  }
  const tickLabels = tickIndices.map((i) => ({
    x: points[i]?.x ?? 0,
    label: formatTickLabel(data[i]?.bucketStart, i, granularity),
  }))

  return (
    <div className={`h-[200px] pt-3 ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid */}
        <g stroke="#E2E8F0" strokeWidth={1}>
          <line x1="0" y1={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.2} x2={W} y2={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.2} />
          <line x1="0" y1={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.5} x2={W} y2={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.5} />
          <line x1="0" y1={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.8} x2={W} y2={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.8} />
          <line x1="0" y1={H - PAD_BOT} x2={W} y2={H - PAD_BOT} />
        </g>

        {/* gradient area */}
        <path d={areaPath} fill="url(#rev-grad)" />

        {/* line */}
        <path d={linePath} fill="none" stroke="#2563EB" strokeWidth={2} />

        {/* trailing highlight */}
        {secondLast && (
          <circle cx={secondLast.x} cy={secondLast.y} r={3.5} fill="#2563EB" />
        )}
        {last && (
          <circle
            cx={last.x}
            cy={last.y}
            r={4}
            fill="#2563EB"
            stroke="white"
            strokeWidth={2}
          />
        )}

        {/* x-axis labels */}
        <g fontFamily="var(--font-plex-mono, ui-monospace)" fontSize={10} fill="#94A3B8">
          {tickLabels.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={H - 4}
              textAnchor={
                i === 0 ? "start" : i === tickLabels.length - 1 ? "end" : "middle"
              }
            >
              {t.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}

function formatTickLabel(
  iso: string | undefined,
  index: number,
  granularity: RevenueGranularity
): string {
  if (!iso) return String(index + 1)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(index + 1)

  if (granularity === "month") {
    return MONTH_PT[d.getMonth()] ?? ""
  }

  if (granularity === "day") {
    const dd = d.getDate().toString().padStart(2, "0")
    const mm = (d.getMonth() + 1).toString().padStart(2, "0")
    return `${dd}/${mm}`
  }

  // week
  const week = getIsoWeek(d)
  return week ? `W${week}` : ""
}

const MONTH_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function getIsoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diff = target.getTime() - firstThursday.getTime()
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000))
}
