"use client"

import { useState, useCallback } from "react"
import { CalendarSync } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { GoogleCalendarCard } from "./GoogleCalendarCard"
import { IcsFeedCard } from "./IcsFeedCard"
import type { CalendarSyncState } from "./types"

/**
 * "Sincronização de Agenda" — the profile section that hosts the Google
 * connection and the iCal feed. Fetches its own state on mount (useMountEffect)
 * and re-fetches after mutations via the `reload` callback.
 */
export function CalendarSyncSettings() {
  const [state, setState] = useState<CalendarSyncState | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar-sync")
      if (res.ok) setState(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useMountEffect(() => {
    void reload()
  })

  return (
    <div className="mt-6 bg-card rounded-lg border border-border p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-1">
        <CalendarSync className="w-5 h-5 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">Sincronização de Agenda</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Veja suas sessões da clínica no seu Google Agenda, Apple Calendar ou Outlook.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !state?.hasProfessionalProfile ? (
        <p className="text-sm text-muted-foreground">
          Esta seção está disponível apenas para usuários com perfil profissional — são eles que
          possuem sessões para sincronizar.
        </p>
      ) : (
        <div className="space-y-6">
          <GoogleCalendarCard google={state.google} onChange={reload} />
          <IcsFeedCard ics={state.ics} onChange={reload} />
        </div>
      )}
    </div>
  )
}
