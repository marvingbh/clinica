/**
 * Two-line trend (sessões realizadas vs. canceladas) over the period buckets.
 * Lightweight inline SVG in the same visual language as revenue-chart.tsx.
 */
interface TrendPoint {
  label: string
  sessions: number
  cancelled: number
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
  }

  const W = 600
  const H = 200
  const PAD_TOP = 10
  const PAD_BOT = 25
  const max = Math.max(...data.map((d) => Math.max(d.sessions, d.cancelled)), 1)

  const toPoints = (key: "sessions" | "cancelled") =>
    data.map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * W
      const y = PAD_TOP + (H - PAD_TOP - PAD_BOT) * (1 - d[key] / max)
      return { x, y }
    })

  const linePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")

  const sessionsPts = toPoints("sessions")
  const cancelledPts = toPoints("cancelled")

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#2563EB] inline-block" /> Sessões realizadas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#DC2626] inline-block" /> Canceladas
        </span>
      </div>
      <div className="h-[200px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <g stroke="#E2E8F0" strokeWidth={1}>
            <line x1="0" y1={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.5} x2={W} y2={PAD_TOP + (H - PAD_TOP - PAD_BOT) * 0.5} />
            <line x1="0" y1={H - PAD_BOT} x2={W} y2={H - PAD_BOT} />
          </g>
          <path d={linePath(sessionsPts)} fill="none" stroke="#2563EB" strokeWidth={2} />
          <path d={linePath(cancelledPts)} fill="none" stroke="#DC2626" strokeWidth={2} />
          <g fontFamily="ui-monospace, monospace" fontSize={10} fill="#94A3B8">
            {data.map((d, i) => (
              <text
                key={i}
                x={sessionsPts[i].x}
                y={H - 4}
                textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              >
                {d.label}
              </text>
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
