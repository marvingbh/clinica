import type { Granularity } from "@/lib/cashflow"

type CashFlowView = "realizado" | "projetado"
type ViewMode = "chart" | "table"

interface CashFlowControlsProps {
  cashFlowView: CashFlowView
  setCashFlowView: (v: CashFlowView) => void
  granularity: Granularity
  setGranularity: (g: Granularity) => void
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}

export function CashFlowControls({
  cashFlowView, setCashFlowView, granularity, setGranularity, viewMode, setViewMode,
}: CashFlowControlsProps) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Visão</label>
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            onClick={() => setCashFlowView("realizado")}
            className={`px-3 py-1.5 text-xs ${cashFlowView === "realizado" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Realizado
          </button>
          <button
            onClick={() => setCashFlowView("projetado")}
            className={`px-3 py-1.5 text-xs ${cashFlowView === "projetado" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Projetado
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Granularidade</label>
        <div className="flex rounded-md border border-input overflow-hidden">
          {(["daily", "weekly", "monthly"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs ${granularity === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {g === "daily" ? "Diário" : g === "weekly" ? "Semanal" : "Mensal"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Visualização</label>
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            onClick={() => setViewMode("chart")}
            className={`px-3 py-1.5 text-xs ${viewMode === "chart" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Gráfico
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 text-xs ${viewMode === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Tabela
          </button>
        </div>
      </div>
      {cashFlowView === "projetado" && (
        <span className="text-xs text-muted-foreground px-2 py-1 bg-blue-50 rounded border border-blue-200 text-blue-700">
          Inclui projeções de despesas recorrentes e faturas em aberto
        </span>
      )}
    </div>
  )
}
