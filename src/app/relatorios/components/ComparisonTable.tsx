import Link from "next/link"
import type { ComparisonRow } from "./types"
import { fmtPct, fmtHours, fmtNumber, fmtBrl } from "./format"

/** Per-professional comparison table — the heart of the Visão Geral tab. */
export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const showRevenue = rows.some((r) => r.revenue != null)

  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Profissional</th>
            <th className="px-3 py-2 font-medium text-right">Horas disp.</th>
            <th className="px-3 py-2 font-medium text-right">Horas agend.</th>
            <th className="px-3 py-2 font-medium text-right">Ocupação</th>
            <th className="px-3 py-2 font-medium text-right">Sessões</th>
            <th className="px-3 py-2 font-medium text-right">Cancel. (Ac./Falta/Prof.)</th>
            <th className="px-3 py-2 font-medium text-right">% Cancel.</th>
            <th className="px-3 py-2 font-medium text-right">Rebooking 7d</th>
            {showRevenue && <th className="px-3 py-2 font-medium text-right">Receita</th>}
            {showRevenue && <th className="px-3 py-2 font-medium text-right">Ticket médio</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.professionalProfileId} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.availableMinutes)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.bookedMinutes)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.occupancy == null ? (
                  <span
                    className="text-muted-foreground cursor-help"
                    title="Cadastre a disponibilidade em Configurações → Disponibilidade para calcular a ocupação."
                  >
                    n/d
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {fmtPct(r.occupancy)}
                    {r.occupancy > 1 && (
                      <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700">acima da grade</span>
                    )}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(r.sessions)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {r.cancellations.CANCELADO_ACORDADO}/{r.cancellations.CANCELADO_FALTA}/
                {r.cancellations.CANCELADO_PROFISSIONAL}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.cancellationRate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.rebooking7)}</td>
              {showRevenue && <td className="px-3 py-2 text-right tabular-nums">{fmtBrl(r.revenue)}</td>}
              {showRevenue && <td className="px-3 py-2 text-right tabular-nums">{fmtBrl(r.avgTicket)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.occupancy == null) && (
        <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
          Profissionais com ocupação &quot;n/d&quot; não têm disponibilidade cadastrada.{" "}
          <Link href="/settings/availability" className="text-primary hover:underline">
            Cadastrar disponibilidade
          </Link>
        </p>
      )}
    </div>
  )
}
