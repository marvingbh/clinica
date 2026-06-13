import type { HeatmapCell } from "./types"

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6..22

/** Day-of-week × hour heatmap of cancellations. Intensity scales with count. */
export function HeatmapGrid({ cells }: { cells: HeatmapCell[] }) {
  const byKey = new Map(cells.map((c) => [`${c.dayOfWeek}-${c.hour}`, c]))
  const max = Math.max(1, ...cells.map((c) => c.total))

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="w-10" />
            {HOURS.map((h) => (
              <th key={h} className="px-1 py-1 font-medium text-muted-foreground text-center">
                {String(h).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((dayLabel, dow) => (
            <tr key={dow}>
              <td className="pr-2 py-1 font-medium text-muted-foreground text-right">{dayLabel}</td>
              {HOURS.map((h) => {
                const cell = byKey.get(`${dow}-${h}`)
                const total = cell?.total ?? 0
                const intensity = total === 0 ? 0 : 0.15 + 0.85 * (total / max)
                const title = cell
                  ? `${dayLabel} ${String(h).padStart(2, "0")}h — ${total} cancelamento(s)` +
                    ` (Acordado: ${cell.byStatus.CANCELADO_ACORDADO}, Falta: ${cell.byStatus.CANCELADO_FALTA}, Prof.: ${cell.byStatus.CANCELADO_PROFISSIONAL})`
                  : ""
                return (
                  <td
                    key={h}
                    title={title}
                    className="w-6 h-6 text-center align-middle border border-background"
                    style={{
                      backgroundColor: total === 0 ? "#F1F5F9" : `rgba(220, 38, 38, ${intensity})`,
                      color: intensity > 0.55 ? "white" : "#334155",
                    }}
                  >
                    {total > 0 ? total : ""}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
