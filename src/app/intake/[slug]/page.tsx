"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { useParams } from "next/navigation"
import { IntakeForm } from "./intake-form"

interface ClinicInfo {
  name: string
  slug: string
  logoUrl: string | null
  hasLogo: boolean
}

type PageState = "loading" | "ready" | "submitting" | "success" | "error"

export default function IntakePage() {
  const params = useParams<{ slug: string }>()
  const [state, setState] = useState<PageState>("loading")
  const [clinic, setClinic] = useState<ClinicInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  useMountEffect(() => {
    const controller = new AbortController()

    ;(async () => {
      try {
        const response = await fetch(`/api/public/intake/${params.slug}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          setState("error")
          setErrorMessage("Clinica nao encontrada")
          return
        }
        const data = await response.json()
        setClinic(data)
        setState("ready")
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setState("error")
        setErrorMessage("Erro de conexao. Tente novamente.")
      }
    })()

    return () => controller.abort()
  })

  async function handleSubmit(data: Record<string, unknown>) {
    setState("submitting")
    try {
      const response = await fetch(`/api/public/intake/${params.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const result = await response.json()
        setErrorMessage(result.error || "Erro ao enviar ficha")
        setState("ready")
        return
      }

      setState("success")
    } catch {
      setErrorMessage("Erro de conexao. Tente novamente.")
      setState("ready")
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 py-10 px-4 sm:py-16">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          {(clinic?.hasLogo || clinic?.logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clinic.hasLogo ? `/api/public/intake/${clinic.slug}/logo` : clinic.logoUrl!}
              alt={clinic.name}
              className="h-24 mx-auto object-contain"
            />
          ) : (
            <h1 className="text-2xl font-semibold text-foreground">
              {clinic?.name || "Clinica"}
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-4 tracking-wide uppercase">
            Ficha de Cadastro
          </p>
        </div>

        {/* Content */}
        {state === "loading" && <LoadingSkeleton />}
        {state === "error" && <ErrorState message={errorMessage} />}
        {(state === "ready" || state === "submitting") && (
          <IntakeForm
            onSubmit={handleSubmit}
            isSubmitting={state === "submitting"}
            errorMessage={errorMessage}
          />
        )}
        {state === "success" && <SuccessState />}
      </div>
    </main>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-pulse">
        <div className="h-5 w-48 bg-muted rounded" />
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-12 bg-muted rounded-lg" />
      </div>
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-12 bg-muted rounded-lg" />
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
      </div>
      <p className="text-foreground font-medium text-lg">{message}</p>
      <p className="text-muted-foreground text-sm mt-2">Verifique o link e tente novamente.</p>
    </div>
  )
}

function SuccessState() {
  return (
    <div className="bg-card border border-border rounded-xl p-10 text-center">
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-3">
        Ficha enviada com sucesso!
      </h2>
      <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
        Obrigado pelo preenchimento! A clinica recebera sua ficha e entrara em contato
        para agendar a primeira consulta.
      </p>
    </div>
  )
}
