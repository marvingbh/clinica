"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { XIcon, CheckIcon } from "@/shared/components/ui/icons"

interface AppointmentDetails {
  id: string
  professionalName: string
  scheduledAt: string
  endAt: string
  modality: string
}

type PageState = "loading" | "ready" | "confirming" | "success" | "error" | "already_confirmed"

function ConfirmationContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  const expires = searchParams.get("expires")
  const sig = searchParams.get("sig")
  const hasParams = !!(id && expires && sig)

  const [state, setState] = useState<PageState>(hasParams ? "loading" : "error")
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null)
  const [errorMessage, setErrorMessage] = useState(
    hasParams ? "" : "Link de confirmacao invalido. Verifique se o link esta completo."
  )

  useEffect(() => {
    if (!hasParams) {
      return
    }

    async function lookupAppointment() {
      try {
        const params = new URLSearchParams({ id: id!, action: "confirm", expires: expires!, sig: sig! })
        const response = await fetch(`/api/public/appointments/lookup?${params}`)
        const data = await response.json()

        if (!response.ok) {
          if (data.alreadyConfirmed) {
            setState("already_confirmed")
            setAppointment(data.appointment)
          } else {
            setState("error")
            setErrorMessage(data.error || "Erro ao carregar agendamento")
          }
          return
        }

        setAppointment(data.appointment)
        setState("ready")
      } catch {
        setState("error")
        setErrorMessage("Erro de conexao. Tente novamente.")
      }
    }

    lookupAppointment()
  }, [hasParams, id, expires, sig])

  async function handleConfirm() {
    if (!hasParams) return

    setState("confirming")

    try {
      const response = await fetch("/api/public/appointments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, expires: Number(expires), sig }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.alreadyConfirmed) {
          setState("already_confirmed")
          setAppointment(data.appointment)
        } else {
          setState("error")
          setErrorMessage(data.error || "Erro ao confirmar agendamento")
        }
        return
      }

      setAppointment(data.appointment)
      setState("success")
    } catch {
      setState("error")
      setErrorMessage("Erro de conexao. Tente novamente.")
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function formatModality(modality: string): string {
    return modality === "ONLINE" ? "Online (videoconferencia)" : "Presencial"
  }

  // Loading state
  if (state === "loading") {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mx-auto" />
        <div className="space-y-4">
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
        </div>
        <div className="h-14 bg-muted rounded" />
      </div>
    )
  }

  // Error state
  if (state === "error") {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
          <XIcon className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Ops! Algo deu errado</h2>
        <p className="text-muted-foreground">{errorMessage}</p>
        <p className="text-sm text-muted-foreground">
          Se o problema persistir, entre em contato com a clinica.
        </p>
      </div>
    )
  }

  // Already confirmed state
  if (state === "already_confirmed" && appointment) {
    return (
      <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-accent flex items-center justify-center">
          <CheckIcon className="w-8 h-8 text-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Agendamento ja confirmado</h2>
          <p className="text-muted-foreground mt-2">Este agendamento ja foi confirmado anteriormente.</p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Profissional</p>
            <p className="font-medium text-foreground">{appointment.professionalName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data</p>
            <p className="font-medium text-foreground">{formatDate(appointment.scheduledAt)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Horario</p>
            <p className="font-medium text-foreground">
              {formatTime(appointment.scheduledAt)} - {formatTime(appointment.endAt)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Modalidade</p>
            <p className="font-medium text-foreground">{formatModality(appointment.modality)}</p>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (state === "success" && appointment) {
    return (
      <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Agendamento confirmado!</h2>
          <p className="text-muted-foreground mt-2">Obrigado por confirmar sua consulta.</p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Profissional</p>
            <p className="font-medium text-foreground">{appointment.professionalName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data</p>
            <p className="font-medium text-foreground">{formatDate(appointment.scheduledAt)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Horario</p>
            <p className="font-medium text-foreground">
              {formatTime(appointment.scheduledAt)} - {formatTime(appointment.endAt)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Modalidade</p>
            <p className="font-medium text-foreground">{formatModality(appointment.modality)}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Voce pode fechar esta pagina.
        </p>
      </div>
    )
  }

  // Ready state - show confirm button
  if (state === "ready" && appointment) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Confirmar agendamento</h2>
          <p className="text-muted-foreground mt-2">Revise os detalhes e confirme sua consulta.</p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Profissional</p>
            <p className="font-medium text-foreground">{appointment.professionalName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data</p>
            <p className="font-medium text-foreground">{formatDate(appointment.scheduledAt)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Horario</p>
            <p className="font-medium text-foreground">
              {formatTime(appointment.scheduledAt)} - {formatTime(appointment.endAt)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Modalidade</p>
            <p className="font-medium text-foreground">{formatModality(appointment.modality)}</p>
          </div>
        </div>

        <button
          onClick={handleConfirm}
          className="w-full h-14 rounded-md bg-primary text-primary-foreground font-medium text-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
        >
          Confirmar
        </button>
      </div>
    )
  }

  // Confirming state
  if (state === "confirming") {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Confirmando...</h2>
          <p className="text-muted-foreground mt-2">Aguarde um momento.</p>
        </div>

        <button
          disabled
          className="w-full h-14 rounded-md bg-primary text-primary-foreground font-medium text-lg opacity-50 cursor-not-allowed"
        >
          Confirmando...
        </button>
      </div>
    )
  }

  return null
}

function LoadingFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-48 bg-muted rounded mx-auto" />
      <div className="space-y-4">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted rounded" />
        <div className="h-4 w-1/2 bg-muted rounded" />
      </div>
      <div className="h-14 bg-muted rounded" />
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-foreground">Clinica</h1>
          </div>

          <Suspense fallback={<LoadingFallback />}>
            <ConfirmationContent />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
