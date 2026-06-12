"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui/button"
import { formatPhoneInput } from "@/lib/phone"
import { OtpInput } from "./OtpInput"
import { usePortal } from "./PortalSessionProvider"

interface PortalLoginProps {
  clinicName: string | null
  hasLogo: boolean
}

type Step = "identifier" | "otp"

export function PortalLogin({ clinicName, hasLogo }: PortalLoginProps) {
  const { slug, refresh } = usePortal()
  const [step, setStep] = useState<Step>("identifier")
  const [identifier, setIdentifier] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [otpError, setOtpError] = useState<string>()

  const isEmail = identifier.includes("@")

  async function requestCode() {
    setSubmitting(true)
    try {
      await fetch(`/api/public/portal/${slug}/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      })
      setStep("otp")
      toast.success("Se houver cadastro, você receberá um código em instantes.")
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyCode(code: string) {
    setSubmitting(true)
    setOtpError(undefined)
    try {
      const res = await fetch(`/api/public/portal/${slug}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code }),
      })
      if (!res.ok) {
        setOtpError("Código inválido ou expirado. Tente novamente.")
        return
      }
      await refresh()
    } catch {
      setOtpError("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/public/intake/${slug}/logo`}
              alt={clinicName ?? "Clínica"}
              className="h-16 mx-auto mb-4 object-contain"
            />
          ) : (
            <h1 className="text-xl font-semibold text-foreground">{clinicName ?? "Clínica"}</h1>
          )}
          <p className="text-sm text-muted-foreground mt-1">Acesse sua área do paciente</p>
        </div>

        {step === "identifier" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (identifier.trim()) void requestCode()
            }}
          >
            <label className="block text-sm font-medium text-foreground">
              Telefone ou e-mail cadastrado na clínica
            </label>
            <input
              value={identifier}
              onChange={(e) =>
                setIdentifier(
                  e.target.value.includes("@") ? e.target.value : formatPhoneInput(e.target.value),
                )
              }
              className="w-full px-4 py-3 border border-border rounded bg-card text-foreground"
              placeholder="(11) 99999-9999 ou voce@email.com"
              autoComplete={isEmail ? "email" : "tel"}
            />
            <Button type="submit" disabled={submitting || !identifier.trim()} className="w-full">
              {submitting ? "Enviando..." : "Receber código"}
            </Button>
          </form>
        ) : (
          <OtpInput
            onSubmit={verifyCode}
            onResend={() => void requestCode()}
            submitting={submitting}
            error={otpError}
          />
        )}
      </div>
    </main>
  )
}
