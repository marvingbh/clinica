"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { PlusIcon } from "@/shared/components/ui/icons"
import { useRequireAuth, usePermission, useMountEffect } from "@/shared/hooks"
import { loadProfessionals, type ProfessionalLite } from "@/lib/professionals/list"
import { WaitlistMetricsCards } from "./components/WaitlistMetricsCards"
import { WaitlistTable } from "./components/WaitlistTable"
import { WaitlistEntrySheet } from "./components/WaitlistEntrySheet"
import { ArchiveEntryDialog } from "./components/ArchiveEntryDialog"
import type { SerializedWaitlistEntry, StatusTab, WaitlistMetricsData } from "./types"

export default function EsperaPage() {
  const { isReady } = useRequireAuth()
  const { canWrite } = usePermission("waitlist")

  const [entries, setEntries] = useState<SerializedWaitlistEntry[]>([])
  const [metrics, setMetrics] = useState<WaitlistMetricsData | null>(null)
  const [professionals, setProfessionals] = useState<ProfessionalLite[]>([])
  const [activeTab, setActiveTab] = useState<StatusTab>("ATIVA")
  const [sheet, setSheet] = useState<{ open: boolean; editing: SerializedWaitlistEntry | null }>({
    open: false,
    editing: null,
  })
  const [archiving, setArchiving] = useState<SerializedWaitlistEntry | null>(null)

  const reload = useCallback(async () => {
    try {
      const [entriesRes, metricsRes] = await Promise.all([
        fetch("/api/waitlist"),
        fetch("/api/waitlist/metrics"),
      ])
      if (entriesRes.ok) {
        const data = await entriesRes.json()
        setEntries(data.entries)
      }
      if (metricsRes.ok) {
        const data = await metricsRes.json()
        setMetrics(data.metrics)
      }
    } catch {
      toast.error("Falha ao carregar a lista de espera")
    }
  }, [])

  useMountEffect(() => {
    if (!isReady) return
    reload()
    loadProfessionals().then(setProfessionals).catch(() => setProfessionals([]))
  })

  if (!isReady) {
    return <div className="p-6 text-[13px] text-ink-500">Carregando...</div>
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 text-[13px] leading-[1.4]">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[12px] text-ink-500">Principal</div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] leading-tight mt-0.5">
            Lista de espera
          </h1>
        </div>
        {canWrite && (
          <button
            onClick={() => setSheet({ open: true, editing: null })}
            className="px-3.5 py-2 rounded-[8px] bg-ink-900 text-white text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-800"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Adicionar
          </button>
        )}
      </header>

      <WaitlistMetricsCards metrics={metrics} />

      <WaitlistTable
        entries={entries}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onEdit={(entry) => setSheet({ open: true, editing: entry })}
        onArchive={(entry) => setArchiving(entry)}
        onReload={reload}
      />

      {sheet.open && (
        <WaitlistEntrySheet
          isOpen={sheet.open}
          onClose={() => setSheet({ open: false, editing: null })}
          onSaved={reload}
          professionals={professionals}
          editing={sheet.editing}
        />
      )}

      <ArchiveEntryDialog
        entry={archiving}
        onClose={() => setArchiving(null)}
        onArchived={reload}
      />
    </div>
  )
}
