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
    <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4 pointer-events-none">
      <div className="max-w-xl mx-auto pointer-events-auto animate-slide-up">
        <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
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
  )
}

function CookieIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="8" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="13" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="0.75" fill="currentColor" stroke="none" />
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
    <div className="p-4 sm:p-5">
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <CookieIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">
            Este sistema utiliza cookies
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Usamos cookies essenciais para autenticacao e seguranca, e cookies
            analiticos opcionais para melhorar o sistema.{" "}
            <button
              onClick={onConfigure}
              className="text-foreground underline underline-offset-2 hover:no-underline transition-colors"
            >
              Saiba mais
            </button>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 pl-11">
        <button
          onClick={onRejectNonNecessary}
          className="px-3.5 py-2 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-muted transition-colors"
        >
          Apenas essenciais
        </button>
        <button
          onClick={onAcceptAll}
          className="px-3.5 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Aceitar todos
        </button>
        <button
          onClick={onConfigure}
          className="px-3.5 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Configurar
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
    <div className="divide-y divide-border">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <CookieIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground">Preferencias de cookies</span>
        </div>
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Voltar
        </button>
      </div>

      {/* Cookie categories */}
      <div className="px-4 sm:px-5 py-3 space-y-3">
        {/* Necessary */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Essenciais</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Autenticacao, sessao e seguranca. Sempre ativos.
              Legit. interesse (art. 7, IX, LGPD).
            </p>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 mt-0.5">
            Sempre ativo
          </span>
        </div>

        {/* Analytics */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Analiticos</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Dados anonimos de uso para melhorias.
              Consentimento (art. 7, I, LGPD).
            </p>
          </div>
          <button
            onClick={() => onAnalyticsChange(!analytics)}
            className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 mt-0.5 ${analytics ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            role="switch"
            aria-checked={analytics}
            aria-label="Ativar cookies analiticos"
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 ${analytics ? "translate-x-[14px]" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Info + actions */}
      <div className="px-4 sm:px-5 py-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
          Voce pode revogar o consentimento a qualquer momento. Para exercer seus direitos
          previstos na LGPD (acesso, correcao, eliminacao), entre em contato com o responsavel
          pela clinica. Cookies tambem podem ser gerenciados pelo navegador.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onRejectNonNecessary}
            className="px-3.5 py-2 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-muted transition-colors"
          >
            Apenas essenciais
          </button>
          <button
            onClick={onSave}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Salvar preferencias
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
