"use client"

import { useState } from "react"
import { useRequireAuth } from "@/shared/hooks"
import { useRelatorios, buildReportParams } from "./context/RelatoriosContext"
import { OverviewTab } from "./components/OverviewTab"
import { RetencaoTab } from "./components/RetencaoTab"
import { CancelamentosTab } from "./components/CancelamentosTab"
import { OrigensTab } from "./components/OrigensTab"
import { GruposTab } from "./components/GruposTab"

type Tab = "visao" | "retencao" | "cancelamentos" | "origens" | "grupos"

const TABS: { key: Tab; label: string }[] = [
  { key: "visao", label: "Visão Geral" },
  { key: "retencao", label: "Retenção" },
  { key: "cancelamentos", label: "Cancelamentos" },
  { key: "origens", label: "Origens" },
  { key: "grupos", label: "Grupos" },
]

export default function RelatoriosPage() {
  const { isReady } = useRequireAuth({ feature: "reports", minAccess: "READ" })
  const ctx = useRelatorios()
  const [tab, setTab] = useState<Tab>("visao")

  const query = buildReportParams(ctx).toString()

  if (!isReady) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  }
  // Key includes every filter so changing a filter remounts the active tab and
  // re-fetches (key-reset pattern — no useEffect dependency choreography).
  const tabKey = `${tab}-${query}`

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "visao" && <OverviewTab key={tabKey} query={query} />}
      {tab === "retencao" && <RetencaoTab key={tabKey} query={query} />}
      {tab === "cancelamentos" && <CancelamentosTab key={tabKey} query={query} />}
      {tab === "origens" && <OrigensTab key={tabKey} query={query} />}
      {tab === "grupos" && <GruposTab key={tabKey} query={query} />}
    </div>
  )
}
