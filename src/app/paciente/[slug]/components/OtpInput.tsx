"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { Button } from "@/shared/components/ui/button"

interface OtpInputProps {
  onSubmit: (code: string) => void
  onResend: () => void
  submitting: boolean
  error?: string
}

const RESEND_SECONDS = 60

export function OtpInput({ onSubmit, onResend, submitting, error }: OtpInputProps) {
  const [code, setCode] = useState("")
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)

  // One-time mount sync for the resend countdown (DOM/timer integration).
  useMountEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  })

  function handleResend() {
    if (secondsLeft > 0) return
    setSecondsLeft(RESEND_SECONDS)
    onResend()
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length === 6) onSubmit(code)
      }}
    >
      <label className="block text-sm font-medium text-foreground">
        Digite o código de 6 dígitos
      </label>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 border border-border rounded bg-card text-foreground"
        placeholder="••••••"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting || code.length !== 6} className="w-full">
        {submitting ? "Verificando..." : "Entrar"}
      </Button>
      <button
        type="button"
        onClick={handleResend}
        disabled={secondsLeft > 0}
        className="w-full text-sm text-muted-foreground disabled:opacity-60"
      >
        {secondsLeft > 0 ? `Reenviar código (${secondsLeft}s)` : "Reenviar código"}
      </button>
    </form>
  )
}
