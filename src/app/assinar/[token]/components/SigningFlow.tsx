"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FileSignature } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { DocumentViewer } from "./DocumentViewer"
import { SignerIdentification } from "./SignerIdentification"
import { OtpStep } from "./OtpStep"
import { SignedSuccess } from "./SignedSuccess"
import { ExpiredView } from "./ExpiredView"
import { DeclineDialog } from "./DeclineDialog"

interface View {
  clinicName: string
  documentTitle: string
  signerName: string
}

type Step = "loading" | "read" | "otp" | "declining" | "success" | "expired" | "invalidated" | "cancelled" | "invalid" | "signed"

export function SigningFlow({ token }: { token: string }) {
  const [step, setStep] = useState<Step>("loading")
  const [view, setView] = useState<View | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [identity, setIdentity] = useState<{ name: string; cpf: string } | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [result, setResult] = useState<{ code: string | null; url: string | null }>({ code: null, url: null })

  async function loadView() {
    try {
      const res = await fetch(`/api/public/assinaturas/${token}`)
      const data = await res.json().catch(() => ({}))
      if (data.state === "active" || data.state === "signed") setView(data.view)
      if (data.state === "active") setStep("read")
      else if (data.state === "signed") setStep("signed")
      else if (data.state === "expired") setStep("expired")
      else if (data.state === "invalidated") setStep("invalidated")
      else if (data.state === "cancelled") setStep("cancelled")
      else setStep("invalid")
    } catch {
      setStep("invalid")
    }
  }
  useMountEffect(() => { loadView() })

  async function requestOtp(name: string, cpf: string) {
    setSubmitting(true)
    try {
      setIdentity({ name, cpf })
      const res = await fetch(`/api/public/assinaturas/${token}/otp`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, cpf }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "Erro ao enviar código"); return }
      setSentTo(data.sentTo ?? null)
      setStep("otp")
    } finally {
      setSubmitting(false)
    }
  }

  async function resendOtp() {
    if (!identity) return
    const res = await fetch(`/api/public/assinaturas/${token}/otp`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(identity),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setSentTo(data.sentTo ?? null); toast.success("Código reenviado.") } else toast.error(data.error ?? "Erro ao reenviar")
  }

  async function sign(code: string) {
    if (!identity) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/assinaturas/${token}/assinar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "Erro ao assinar"); return }
      setResult({ code: data.verificationCode ?? null, url: data.downloadUrl ?? null })
      setStep("success")
    } finally {
      setSubmitting(false)
    }
  }

  async function decline(reason: string) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/assinaturas/${token}/recusar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Erro ao recusar"); return }
      toast.success("Sua recusa foi registrada. A clínica foi avisada.")
      setStep("invalid")
    } finally {
      setSubmitting(false)
    }
  }

  async function requestRenewal() {
    await fetch(`/api/public/assinaturas/${token}/renovar`, { method: "POST" }).catch(() => {})
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-4">
      <header className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-blue-700" />
        <div>
          <p className="text-sm font-semibold leading-tight">{view ? `Assinatura de documento — ${view.clinicName}` : "Assinatura de documento"}</p>
          {view && <p className="text-xs text-muted-foreground">{view.documentTitle}</p>}
        </div>
      </header>

      {step === "loading" && <div className="h-40 w-full animate-pulse rounded-md bg-muted" />}

      {(step === "expired" || step === "invalidated" || step === "cancelled" || step === "invalid") && (
        <ExpiredView state={step} onRequestRenewal={requestRenewal} />
      )}

      {step === "signed" && <SignedSuccess verificationCode={null} downloadUrl={`/api/public/assinaturas/${token}/arquivo`} />}

      {step === "success" && <SignedSuccess verificationCode={result.code} downloadUrl={result.url} />}

      {step === "read" && view && (
        <>
          <DocumentViewer token={token} />
          <SignerIdentification signerName={view.signerName} onSubmit={requestOtp} submitting={submitting} />
          <button type="button" onClick={() => setStep("declining")} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
            Não concordo / recusar
          </button>
        </>
      )}

      {step === "otp" && (
        <OtpStep sentTo={sentTo} onSubmit={sign} onResend={resendOtp} submitting={submitting} />
      )}

      {step === "declining" && (
        <DeclineDialog onConfirm={decline} onCancel={() => setStep("read")} submitting={submitting} />
      )}
    </div>
  )
}
