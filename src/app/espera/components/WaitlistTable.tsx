"use client"

import { toast } from "sonner"
import { EmptyState } from "@/shared/components/ui/error-state"
import { WaitlistEntryRow } from "./WaitlistEntryRow"
import { WAITLIST_ENTRY_STATUS_LABELS } from "@/lib/waitlist"
import type { SerializedWaitlistEntry, StatusTab } from "../types"

const TABS: StatusTab[] = ["ATIVA", "OFERTADA", "CONVERTIDA", "REMOVIDA"]

interface Props {
  entries: SerializedWaitlistEntry[]
  activeTab: StatusTab
  onTabChange: (tab: StatusTab) => void
  onEdit: (entry: SerializedWaitlistEntry) => void
  onArchive: (entry: SerializedWaitlistEntry) => void
  onReload: () => void
}

export function WaitlistTable({
  entries,
  activeTab,
  onTabChange,
  onEdit,
  onArchive,
  onReload,
}: Props) {
  const visible = entries.filter((e) => e.status === activeTab)
  const reorderable = activeTab === "ATIVA"

  async function handleMove(entry: SerializedWaitlistEntry, direction: "up" | "down") {
    const ordered = [...visible]
    const idx = ordered.findIndex((e) => e.id === entry.id)
    const swapWith = direction === "up" ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= ordered.length) return
    ;[ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]]

    try {
      const res = await fetch("/api/waitlist/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((e) => e.id) }),
      })
      if (!res.ok) throw new Error("Falha ao reordenar")
      onReload()
    } catch {
      toast.error("Não foi possível reordenar")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "ATIVA"
              ? "Ativas"
              : tab === "OFERTADA"
                ? "Ofertadas"
                : tab === "CONVERTIDA"
                  ? "Convertidas"
                  : "Removidas"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={`Nenhuma entrada ${WAITLIST_ENTRY_STATUS_LABELS[activeTab]?.toLowerCase() ?? ""}`}
          message="As entradas aparecem aqui conforme você as adiciona."
        />
      ) : (
        <div className="space-y-2">
          {visible.map((entry, i) => (
            <WaitlistEntryRow
              key={entry.id}
              entry={entry}
              index={i}
              total={visible.length}
              reorderable={reorderable}
              onEdit={onEdit}
              onArchive={onArchive}
              onMove={handleMove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
