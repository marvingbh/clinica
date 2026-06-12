"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { usePortal } from "./PortalSessionProvider"
import { SessionCard } from "./SessionCard"
import type { PortalAppointmentView } from "./format"

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

  // Reload when the component mounts and whenever the tab regains focus
  // (lightweight SWR-style revalidation, no raw effect dependency choreography).
  useMountEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  })

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
  }

  if (appointments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        {range === "upcoming" ? "Você não tem sessões agendadas." : "Nenhuma sessão anterior."}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {appointments.map((a) => (
        <SessionCard key={a.id} appointment={a} onChanged={load} />
      ))}
    </div>
  )
}
