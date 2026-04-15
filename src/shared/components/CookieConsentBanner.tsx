"use client"

import React, { useState, useCallback } from "react"
import { useMountEffect } from "@/shared/hooks"

const CONSENT_KEY = "cookie-consent"

interface CookiePreferences {
  necessary: true
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
  const [analytics, setAnalytics] = useState(false)

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
    <div className="fixed bottom-0 inset-x-0 z-50 pointer-events-none pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="max-w-md mx-auto md:mx-0 md:ml-auto pointer-events-auto animate-scale-in">
          <div className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
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
      </div>
    </div>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
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
    <div className="p-4">
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <ShieldIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">
            Privacidade e cookies
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Cookies essenciais para autenticacao e seguranca, e opcionais para melhorias.{" "}
            <button
              onClick={onConfigure}
              className="text-foreground underline underline-offset-2 hover:no-underline transition-colors"
            >
              Detalhes
            </button>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pl-11">
        <button
          onClick={onRejectNonNecessary}
          className="h-8 px-3 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-muted active:scale-[0.98] transition-all touch-manipulation"
        >
          Essenciais
        </button>
        <button
          onClick={onAcceptAll}
          className="h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all touch-manipulation"
        >
          Aceitar todos
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
    <div>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors touch-manipulation"
            aria-label="Voltar"
          >
            <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-sm font-medium text-foreground">Preferencias</span>
        </div>
      </div>

      {/* Cookie categories */}
      <div className="px-4 pb-3 space-y-2.5">
        {/* Necessary */}
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/50">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Essenciais</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Autenticacao, sessao e seguranca (art. 7, IX, LGPD)
            </p>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            Ativo
          </span>
        </div>

        {/* Analytics */}
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/50">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Analiticos</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Dados anonimos de uso (art. 7, I, LGPD)
            </p>
          </div>
          <button
            onClick={() => onAnalyticsChange(!analytics)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 touch-manipulation ${analytics ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            role="switch"
            aria-checked={analytics}
            aria-label="Ativar cookies analiticos"
          >
            <span
              className={`absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${analytics ? "translate-x-4" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Info + actions */}
      <div className="px-4 pt-2.5 pb-4 border-t border-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
          Revogue o consentimento a qualquer momento. Para direitos LGPD, contate a clinica.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onRejectNonNecessary}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-muted active:scale-[0.98] transition-all touch-manipulation"
          >
            Essenciais
          </button>
          <button
            onClick={onSave}
            className="h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all touch-manipulation"
          >
            Salvar
          </button>
        </div>
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
