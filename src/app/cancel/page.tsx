"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"

interface AppointmentDetails {
  id: string
  professionalName: string
  scheduledAt: string
  endAt: string
  modality: string
}

type PageState = "loading" | "ready" | "cancelling" | "success" | "error" | "already_cancelled"

function CancellationContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [state, setState] = useState<PageState>(token ? "loading" : "error")
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null)
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Link de cancelamento invalido. Verifique se o link esta completo."
  )
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (!token) {
      return
    }

    async function lookupAppointment() {
      try {
        const response = await fetch(`/api/public/appointments/lookup?token=${encodeURIComponent(token!)}&action=cancel`)
        const data = await response.json()

        if (!response.ok) {
          if (data.alreadyCancelled) {
            setState("already_cancelled")
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
  }, [token])

  async function handleCancel() {
    if (!token) return

    setState("cancelling")

    try {
      const response = await fetch("/api/public/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: reason.trim() || undefined }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.alreadyCancelled) {
          setState("already_cancelled")
          setAppointment(data.appointment)
        } else {
          setState("error")
          setErrorMessage(data.error || "Erro ao cancelar agendamento")
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
          <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-foreground">Ops! Algo deu errado</h2>
        <p className="text-muted-foreground">{errorMessage}</p>
        <p className="text-sm text-muted-foreground">
          Se o problema persistir, entre em contato com a clinica.
        </p>
      </div>
    )
  }

  // Already cancelled state
  if (state === "already_cancelled" && appointment) {
    return (
      <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-accent flex items-center justify-center">
          <svg className="w-8 h-8 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Agendamento ja cancelado</h2>
          <p className="text-muted-foreground mt-2">Este agendamento ja foi cancelado anteriormente.</p>
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
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Agendamento cancelado</h2>
          <p className="text-muted-foreground mt-2">Seu agendamento foi cancelado com sucesso.</p>
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

  // Ready state - show cancel button
  if (state === "ready" && appointment) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Cancelar agendamento</h2>
          <p className="text-muted-foreground mt-2">Revise os detalhes antes de cancelar sua consulta.</p>
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

        <div className="space-y-2">
          <label htmlFor="reason" className="block text-sm font-medium text-foreground">
            Motivo do cancelamento (opcional)
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Deixe um motivo se desejar..."
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background resize-none"
          />
        </div>

        <button
          onClick={handleCancel}
          className="w-full h-14 rounded-md bg-destructive text-destructive-foreground font-medium text-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
        >
          Cancelar Agendamento
        </button>
      </div>
    )
  }

  // Cancelling state
  if (state === "cancelling") {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Cancelando...</h2>
          <p className="text-muted-foreground mt-2">Aguarde um momento.</p>
        </div>

        <button
          disabled
          className="w-full h-14 rounded-md bg-destructive text-destructive-foreground font-medium text-lg opacity-50 cursor-not-allowed"
        >
          Cancelando...
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

export default function CancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-foreground">Clinica</h1>
          </div>

          <Suspense fallback={<LoadingFallback />}>
            <CancellationContent />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
