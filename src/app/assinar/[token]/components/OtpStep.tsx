"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"

interface Props {
  sentTo: string | null
  onSubmit: (code: string) => void
  onResend: () => void
  submitting: boolean
}

export function OtpStep({ sentTo, onSubmit, onResend, submitting }: Props) {
  const [code, setCode] = useState("")
  const [seconds, setSeconds] = useState(60)

  useMountEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  })

  function resend() {
    setSeconds(60)
    onResend()
  }

  return (
    <div className="space-y-3">
      {sentTo && (
        <p className="text-sm text-muted-foreground">
          Enviamos um código de 6 dígitos para {sentTo}.
        </p>
      )}
      <input
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        className="w-full h-12 rounded-md border border-input bg-background px-3 text-center text-2xl tracking-[0.5em]"
      />
      <button
        type="button"
        disabled={submitting || code.length !== 6}
        onClick={() => onSubmit(code)}
        className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
      >
        {submitting ? "Assinando..." : "Assinar documento"}
      </button>
      <button
        type="button"
        disabled={seconds > 0}
        onClick={resend}
        className="w-full text-sm text-blue-700 hover:text-blue-900 disabled:text-muted-foreground"
      >
        {seconds > 0 ? `Reenviar código (${seconds}s)` : "Reenviar código"}
      </button>
    </div>
  )
}
