"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { useParams } from "next/navigation"
import { IntakeForm } from "./intake-form"

interface ClinicInfo {
  name: string
  slug: string
  logoUrl: string | null
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
    <main className="min-h-screen flex items-center justify-center px-4 py-8 bg-background">
      <div className="w-full max-w-2xl">
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-6">
            {clinic?.logoUrl && (
              <img
                src={clinic.logoUrl}
                alt={clinic.name}
                className="w-16 h-16 mx-auto mb-3 rounded-full object-cover"
              />
            )}
            <h1 className="text-2xl font-semibold text-foreground">
              {clinic?.name || "Clinica"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
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
      </div>
    </main>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 bg-muted rounded" />
      ))}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
        <span className="text-destructive text-xl">!</span>
      </div>
      <p className="text-foreground font-medium">{message}</p>
    </div>
  )
}

function SuccessState() {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <span className="text-green-600 dark:text-green-400 text-xl">✓</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">
        Ficha enviada com sucesso!
      </h2>
      <p className="text-muted-foreground">
        Obrigado! A clinica recebera sua ficha e entrara em contato para agendar a primeira consulta.
      </p>
    </div>
  )
}
