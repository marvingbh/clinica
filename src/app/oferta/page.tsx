"use client"

import { Suspense, useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { useSearchParams } from "next/navigation"
import { XIcon, CheckIcon } from "@/shared/components/ui/icons"

interface OfferDetails {
  professionalName: string
  clinicName: string
  scheduledAt: string
  endAt: string
  modality: string | null
  expiresAt: string
  timezone: string
}

type PageState =
  | "loading"
  | "ready"
  | "accepting"
  | "declining"
  | "success"
  | "declined"
  | "expired"
  | "error"

function OfferContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [state, setState] = useState<PageState>(token ? "loading" : "error")
  const [offer, setOffer] = useState<OfferDetails | null>(null)
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Link inválido. Verifique se o link está completo."
  )

  useMountEffect(() => {
    if (!token) return
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`/api/public/waitlist/offer?token=${encodeURIComponent(token)}`, {
          signal: controller.signal,
        })
        const data = await res.json()
        if (!res.ok) {
          setState("expired")
          setErrorMessage(
            data.error ||
              "Este link expirou ou o horário já foi preenchido. Você continua na lista de espera."
          )
          return
        }
        setOffer(data)
        setState("ready")
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setState("error")
        setErrorMessage("Erro de conexão. Tente novamente.")
      }
    })()
    return () => controller.abort()
  })

  async function handleAccept() {
    if (!token) return
    setState("accepting")
    try {
      const res = await fetch("/api/public/waitlist/offer/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setState("expired")
        setErrorMessage(
          data.error ||
            "Este link expirou ou o horário já foi preenchido. Você continua na lista de espera."
        )
        return
      }
      setState("success")
    } catch {
      setState("error")
      setErrorMessage("Erro de conexão. Tente novamente.")
    }
  }

  async function handleDecline() {
    if (!token) return
    setState("declining")
    try {
      const res = await fetch("/api/public/waitlist/offer/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const data = await res.json()
        setState("expired")
        setErrorMessage(data.error || "Esta oferta não está mais disponível.")
        return
      }
      setState("declined")
    } catch {
      setState("error")
      setErrorMessage("Erro de conexão. Tente novamente.")
    }
  }

  function fmtDate(iso: string, tz: string): string {
    return new Date(iso).toLocaleDateString("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }
  function fmtTime(iso: string, tz: string): string {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  function fmtModality(m: string | null): string {
    if (m === "ONLINE") return "Online (videoconferência)"
    if (m === "PRESENCIAL") return "Presencial"
    return "A combinar"
  }

  if (state === "loading") {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mx-auto" />
        <div className="space-y-4">
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
        </div>
        <div className="h-14 bg-muted rounded" />
      </div>
    )
  }

  if (state === "error" || state === "expired") {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
          <XIcon className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          {state === "expired" ? "Oferta indisponível" : "Ops! Algo deu errado"}
        </h2>
        <p className="text-muted-foreground">{errorMessage}</p>
      </div>
    )
  }

  if (state === "success") {
    return (
      <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
          <CheckIcon className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Horário confirmado!</h2>
          <p className="text-muted-foreground mt-2">Você receberá os detalhes em breve.</p>
        </div>
        <p className="text-sm text-muted-foreground">Você pode fechar esta página.</p>
      </div>
    )
  }

  if (state === "declined") {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Tudo bem!</h2>
        <p className="text-muted-foreground">
          Você continua na nossa lista de espera e avisaremos na próxima oportunidade.
        </p>
      </div>
    )
  }

  if ((state === "ready" || state === "accepting" || state === "declining") && offer) {
    const busy = state !== "ready"
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Oferta de horário</h2>
          <p className="text-muted-foreground mt-2">
            Surgiu um horário para você. Aceite para confirmar.
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <Detail label="Profissional" value={offer.professionalName} />
          <Detail label="Data" value={fmtDate(offer.scheduledAt, offer.timezone)} />
          <Detail
            label="Horário"
            value={`${fmtTime(offer.scheduledAt, offer.timezone)} - ${fmtTime(offer.endAt, offer.timezone)}`}
          />
          <Detail label="Modalidade" value={fmtModality(offer.modality)} />
          <Detail
            label="Válida até"
            value={`${fmtDate(offer.expiresAt, offer.timezone)} ${fmtTime(offer.expiresAt, offer.timezone)}`}
          />
        </div>

        <button
          onClick={handleAccept}
          disabled={busy}
          className="w-full h-14 rounded-md bg-primary text-primary-foreground font-medium text-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {state === "accepting" ? "Confirmando..." : "Aceitar horário"}
        </button>
        <button
          onClick={handleDecline}
          disabled={busy}
          className="w-full h-12 rounded-md text-muted-foreground font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {state === "declining" ? "Processando..." : "Não tenho interesse"}
        </button>
      </div>
    )
  }

  return null
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-48 bg-muted rounded mx-auto" />
      <div className="h-14 bg-muted rounded" />
    </div>
  )
}

export default function OfertaPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-foreground">Clínica</h1>
          </div>
          <Suspense fallback={<LoadingFallback />}>
            <OfferContent />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
