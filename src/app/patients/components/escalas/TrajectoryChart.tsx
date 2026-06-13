"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts"
import {
  buildTrajectorySeries,
  buildSeverityAreas,
  getScaleDefinition,
  type ScaleCode,
} from "@/lib/scales"
import type { AdministrationRow } from "./types"

interface TrajectoryChartProps {
  administrations: AdministrationRow[]
  scaleCode: ScaleCode
}

/** Line chart of scores over time with severity bands shaded behind the line. */
export function TrajectoryChart({ administrations, scaleCode }: TrajectoryChartProps) {
  const def = getScaleDefinition(scaleCode)
  const series = buildTrajectorySeries(administrations, scaleCode).map((p) => ({
    dateLabel: p.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    fullDate: p.date.toLocaleDateString("pt-BR"),
    totalScore: p.totalScore,
    severityLabel: p.severityLabel,
  }))

  if (series.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
        Nenhuma administração concluída ainda para esta escala.
      </p>
    )
  }

  const areas = buildSeverityAreas(def)

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          {areas.map((a) => (
            <ReferenceArea
              key={a.label}
              y1={a.y1}
              y2={a.y2}
              fill={severityFill(a.label)}
              fillOpacity={0.12}
              ifOverflow="extendDomain"
            />
          ))}
          <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, def.maxScore]} tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, _name, item) => {
              const severity = (item?.payload as { severityLabel?: string })?.severityLabel ?? ""
              return [`${value} — ${severity}`, "Pontuação"]
            }}
            labelFormatter={(_label, payload) => {
              const point = payload?.[0]?.payload as { fullDate?: string } | undefined
              return point?.fullDate ?? ""
            }}
          />
          <Line
            type="monotone"
            dataKey="totalScore"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
        {areas.map((a) => (
          <span key={a.label} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: severityFill(a.label) }}
            />
            {a.label} ({a.y1}–{a.y2})
          </span>
        ))}
      </div>
    </div>
  )
}

/** Solid hex per severity band (recharts needs a real color, not a tw class). */
function severityFill(label: string): string {
  if (label.startsWith("Grave")) return "#ef4444"
  if (label.startsWith("Moderadamente")) return "#f97316"
  if (label.startsWith("Moderad")) return "#f59e0b"
  if (label.startsWith("Leve")) return "#84cc16"
  return "#10b981"
}
