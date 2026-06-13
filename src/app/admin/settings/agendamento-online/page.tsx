"use client"

import { useState, useCallback } from "react"
// eslint-disable-next-line no-restricted-imports -- auth-readiness data fetch must re-run when isReady flips
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useRequireAuth } from "@/shared/hooks"
import { BookingSettingsForm } from "./components/BookingSettingsForm"
import { ProfessionalBookingTable } from "./components/ProfessionalBookingTable"
import type { BookingSettingsState } from "./components/types"

export default function AgendamentoOnlineSettingsPage() {
  const router = useRouter()
  const { isReady, status } = useRequireAuth({ feature: "clinic_settings", minAccess: "READ" })
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<BookingSettingsState | null>(null)
  const [clinicSlug, setClinicSlug] = useState<string>("")

  const load = useCallback(async () => {
    try {
      const [settingsRes, meRes] = await Promise.all([
        fetch("/api/clinic/booking-settings"),
        fetch("/api/admin/settings"),
      ])
      if (settingsRes.status === 403) {
        toast.error("Acesso negado")
        router.push("/")
        return
      }
      const settingsData = await settingsRes.json()
      setSettings(settingsData.settings)
      if (meRes.ok) {
        const me = await meRes.json()
        setClinicSlug(me.settings?.slug ?? "")
      }
    } catch {
      toast.error("Erro ao carregar configurações")
    } finally {
      setLoading(false)
    }
  }, [router])

  // Data fetch depends on auth readiness — must re-run when isReady flips true
  // (a mount-only effect would never fire on a direct URL load / refresh).
  useEffect(() => {
    if (isReady) void load()
  }, [isReady, load])

  if (status === "loading" || loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-6">
          <div className="h-8 w-56 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          &larr; Voltar
        </button>
        <h1 className="text-2xl font-semibold text-foreground mb-6">Agendamento Online</h1>

        {settings && (
          <div className="space-y-8">
            <BookingSettingsForm
              settings={settings}
              clinicSlug={clinicSlug}
              onUpdate={setSettings}
            />
            <ProfessionalBookingTable clinicSlug={clinicSlug} />
          </div>
        )}
      </div>
    </main>
  )
}
