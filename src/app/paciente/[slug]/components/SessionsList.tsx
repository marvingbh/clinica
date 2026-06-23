"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { usePortal } from "./PortalSessionProvider"
import { SessionCard } from "./SessionCard"
import { FilteredPagedList } from "./FilteredPagedList"
import { statusLabel, modalityLabel, type PortalAppointmentView } from "./format"

export function SessionsList({ range }: { range: "upcoming" | "past" }) {
  const { slug, activeProfileId } = usePortal()
  const [appointments, setAppointments] = useState<PortalAppointmentView[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!activeProfileId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/public/portal/${slug}/appointments?patientId=${activeProfileId}&range=${range}`,
        { cache: "no-store" },
      )
      if (res.ok) {
        const data = await res.json()
        setAppointments(data.appointments ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  // Reload on mount and whenever the tab regains focus (lightweight revalidation).
  useMountEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  })

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
  }

  return (
    <FilteredPagedList
      items={appointments}
      getKey={(a) => a.id}
      getSearchText={(a) => `${a.professionalName} ${statusLabel(a.status)} ${modalityLabel(a.modality)}`}
      getDate={(a) => a.scheduledAt}
      dateDirection={range === "upcoming" ? "future" : "past"}
      renderItem={(a) => <SessionCard appointment={a} onChanged={load} />}
      searchPlaceholder="Buscar por profissional, status…"
      emptyText={range === "upcoming" ? "Você não tem sessões agendadas." : "Nenhuma sessão anterior."}
    />
  )
}
