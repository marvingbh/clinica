"use client"

import React, { useState, useCallback } from "react"
import { useMountEffect } from "@/shared/hooks"

const CONSENT_KEY = "cookie-consent"

interface CookiePreferences {
  necessary: true // always true, can't be disabled
  analytics: boolean
}

type ConsentState = "pending" | "accepted" | "rejected" | "custom"

function getStoredConsent(): { state: ConsentState; preferences: CookiePreferences } | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function storeConsent(state: ConsentState, preferences: CookiePreferences) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ state, preferences, updatedAt: new Date().toISOString() }))
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [analytics, setAnalytics] = useState(false) // disabled by default per ANPD

  useMountEffect(() => {
    const stored = getStoredConsent()
    if (!stored) setVisible(true)
  })

  const handleAcceptAll = useCallback(() => {
    storeConsent("accepted", { necessary: true, analytics: true })
    setVisible(false)
  }, [])

  const handleRejectNonNecessary = useCallback(() => {
    storeConsent("rejected", { necessary: true, analytics: false })
    setVisible(false)
  }, [])

  const handleSavePreferences = useCallback(() => {
    storeConsent("custom", { necessary: true, analytics })
    setVisible(false)
  }, [analytics])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center p-4 pointer-events-none">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 pointer-events-auto" />

      <div className="relative w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl pointer-events-auto">
        {!showSettings ? (
          <FirstLevel
            onAcceptAll={handleAcceptAll}
            onRejectNonNecessary={handleRejectNonNecessary}
            onConfigure={() => setShowSettings(true)}
          />
        ) : (
          <SecondLevel
            analytics={analytics}
            onAnalyticsChange={setAnalytics}
            onSave={handleSavePreferences}
            onRejectNonNecessary={handleRejectNonNecessary}
            onBack={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  )
}

function FirstLevel({
  onAcceptAll,
  onRejectNonNecessary,
  onConfigure,
}: {
  onAcceptAll: () => void
  onRejectNonNecessary: () => void
  onConfigure: () => void
}) {
  return (
    <div className="p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Politica de Cookies</h3>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Utilizamos cookies necessarios para o funcionamento seguro do sistema,
          como autenticacao e manutencao da sua sessao. Tambem podemos utilizar
          cookies analiticos para melhorar nossos servicos. Voce pode aceitar todos,
          rejeitar os nao necessarios ou configurar suas preferencias.
        </p>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>
          Para mais informacoes sobre como tratamos seus dados, consulte nossa{" "}
          <button onClick={onConfigure} className="underline text-primary hover:text-primary/80 transition-colors">
            Politica de Cookies
          </button>
          , em conformidade com a Lei Geral de Protecao de Dados (LGPD — Lei n. 13.709/2018).
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={onRejectNonNecessary}
          className="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors"
        >
          Rejeitar nao necessarios
        </button>
        <button
          onClick={onAcceptAll}
          className="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors"
        >
          Aceitar todos os cookies
        </button>
        <button
          onClick={onConfigure}
          className="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors"
        >
          Configurar cookies
        </button>
      </div>
    </div>
  )
}

function SecondLevel({
  analytics,
  onAnalyticsChange,
  onSave,
  onRejectNonNecessary,
  onBack,
}: {
  analytics: boolean
  onAnalyticsChange: (v: boolean) => void
  onSave: () => void
  onRejectNonNecessary: () => void
  onBack: () => void
}) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Configuracao de Cookies</h3>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Voltar
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Abaixo voce pode gerenciar suas preferencias de cookies por categoria.
        Cookies necessarios nao podem ser desativados, pois sao essenciais para
        o funcionamento do sistema.
      </p>

      {/* Necessary cookies - always active */}
      <div className="rounded-lg border border-border p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Cookies necessarios</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            Sempre ativos
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Essenciais para o funcionamento do sistema. Incluem cookies de autenticacao,
          sessao e seguranca (CSRF). Sem eles, nao e possivel utilizar o sistema.
          Base legal: legitimo interesse (art. 7, IX, LGPD).
        </p>
      </div>

      {/* Analytics cookies - optional */}
      <div className="rounded-lg border border-border p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Cookies analiticos</span>
          <button
            onClick={() => onAnalyticsChange(!analytics)}
            className={`relative w-9 h-5 rounded-full transition-colors ${analytics ? "bg-primary" : "bg-muted"}`}
            role="switch"
            aria-checked={analytics}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${analytics ? "translate-x-4" : ""}`}
            />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Permitem coletar dados anonimos sobre como o sistema e utilizado,
          ajudando a identificar melhorias. Nao identificam voce pessoalmente.
          Base legal: consentimento (art. 7, I, LGPD).
        </p>
      </div>

      {/* Browser info */}
      <p className="text-[11px] text-muted-foreground">
        Voce tambem pode gerenciar cookies pelas configuracoes do seu navegador.
        Note que desabilitar cookies necessarios pode afetar o funcionamento do sistema.
      </p>

      {/* Rights info */}
      <p className="text-[11px] text-muted-foreground">
        Conforme a LGPD, voce tem direito de acessar, corrigir, eliminar seus dados e
        revogar o consentimento a qualquer momento. Para exercer esses direitos, entre
        em contato com o responsavel pela clinica.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={onRejectNonNecessary}
          className="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors"
        >
          Rejeitar nao necessarios
        </button>
        <button
          onClick={onSave}
          className="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium border border-border bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Salvar preferencias
        </button>
      </div>
    </div>
  )
}

/**
 * Retrieve stored cookie preferences (for use by analytics scripts).
 * Returns null if no consent has been given yet.
 */
export function getCookiePreferences(): CookiePreferences | null {
  const stored = getStoredConsent()
  return stored?.preferences ?? null
}
