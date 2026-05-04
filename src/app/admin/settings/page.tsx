"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, Calendar, DollarSign, Mail, FileText, Palette } from "lucide-react"
import { useRequireAuth } from "@/shared/hooks"
import type { ClinicSettings } from "./types"
import GeneralTab from "./components/GeneralTab"
import SchedulingTab from "./components/SchedulingTab"
import BillingTab from "./components/BillingTab"
import EmailTab from "./components/EmailTab"
import NfseConfigForm from "./components/NfseConfigForm"
import AgendaColorsTab from "./components/AgendaColorsTab"

// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"

const TABS = [
  { id: "geral" as const, label: "Clinica", icon: Building2 },
  { id: "agenda" as const, label: "Agenda", icon: Calendar },
  { id: "cores" as const, label: "Cores", icon: Palette },
  { id: "financeiro" as const, label: "Financeiro", icon: DollarSign },
  { id: "email" as const, label: "E-mail", icon: Mail },
  { id: "nfse" as const, label: "NFS-e", icon: FileText },
]

type TabId = (typeof TABS)[number]["id"]

export default function AdminSettingsPage() {
  const router = useRouter()
  const { isReady, status } = useRequireAuth({ feature: "clinic_settings", minAccess: "READ" })
  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState<ClinicSettings | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>("geral")

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings")
      if (res.status === 403) {
        toast.error("Acesso negado")
        router.push("/")
        return
      }
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSettings(data.settings)
    } catch {
      toast.error("Erro ao carregar configurações")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  // Data fetch depends on auth readiness — must remain an effect
  useEffect(() => {
    if (isReady) fetchSettings()
  }, [isReady, fetchSettings])

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted rounded" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Voltar
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-6">Configurações da Clínica</h1>

        {/* Tabs — scrollable pills, mobile-first */}
        <div
          className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-4 mb-6"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground active:bg-muted hover:text-foreground"
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {settings && (
          <>
            {activeTab === "geral" && <GeneralTab settings={settings} onUpdate={setSettings} />}
            {activeTab === "agenda" && <SchedulingTab settings={settings} onUpdate={setSettings} />}
            {activeTab === "cores" && <AgendaColorsTab settings={settings} onUpdate={setSettings} />}
            {activeTab === "financeiro" && <BillingTab settings={settings} onUpdate={setSettings} />}
            {activeTab === "email" && <EmailTab settings={settings} onUpdate={setSettings} />}
            {activeTab === "nfse" && <NfseConfigForm />}
          </>
        )}
      </div>
    </main>
  )
}
