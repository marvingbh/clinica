"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { ChevronLeft, Loader2, CheckCircle2, HeartHandshake } from "lucide-react"

interface ScaleOption {
  value: number
  label: string
}
interface ScaleItem {
  id: string
  text: string
}
interface ScaleData {
  shortName: string
  stem: string
  items: ScaleItem[]
  options: ScaleOption[]
}
interface LoadedScale {
  scale: ScaleData
  savedAnswers: Record<string, number>
  clinicName: string
  professionalName: string
  patientFirstName: string
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "expired"; message: string }
  | { kind: "done"; message: string; riskEndorsed: boolean }
  | { kind: "ready"; data: LoadedScale }

export function ScaleFillForm({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ kind: "loading" })
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [step, setStep] = useState(0) // -1 = welcome handled by step 0 gate
  const [showWelcome, setShowWelcome] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useMountEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`/api/public/escalas/${token}`, { signal: controller.signal })
        const data = await res.json().catch(() => ({}))
        if (data.alreadyCompleted) {
          setState({ kind: "done", message: data.message, riskEndorsed: false })
          return
        }
        if (res.status === 410 || data.expired) {
          setState({ kind: "expired", message: data.error ?? "Este link expirou." })
          return
        }
        if (!res.ok) {
          setState({ kind: "error", message: data.error ?? "Link inválido" })
          return
        }
        setAnswers(data.savedAnswers ?? {})
        // Resume at the first unanswered item.
        const firstGap = data.scale.items.findIndex(
          (it: ScaleItem) => (data.savedAnswers ?? {})[it.id] === undefined
        )
        setStep(firstGap === -1 ? data.scale.items.length - 1 : firstGap)
        setState({ kind: "ready", data })
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setState({ kind: "error", message: "Não foi possível carregar o questionário." })
      }
    })()
    return () => controller.abort()
  })

  if (state.kind === "loading") {
    return (
      <CenteredCard>
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </CenteredCard>
    )
  }

  if (state.kind === "error") {
    return (
      <CenteredCard>
        <p className="text-center text-gray-700">{state.message}</p>
      </CenteredCard>
    )
  }

  if (state.kind === "expired") {
    return (
      <CenteredCard>
        <p className="text-center text-gray-700">{state.message}</p>
      </CenteredCard>
    )
  }

  if (state.kind === "done") {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-4 text-center">
          {state.riskEndorsed ? (
            <HeartHandshake className="h-12 w-12 text-rose-500" />
          ) : (
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          )}
          <p className="whitespace-pre-line leading-relaxed text-gray-700">{state.message}</p>
        </div>
      </CenteredCard>
    )
  }

  const { scale, clinicName, professionalName } = state.data
  const total = scale.items.length

  if (showWelcome) {
    return (
      <CenteredCard>
        <div className="space-y-4 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-600">{clinicName}</p>
          <h1 className="text-xl font-semibold text-gray-900">{scale.shortName}</h1>
          <p className="text-sm text-gray-600">
            {professionalName} pediu que você responda este breve questionário com {total} perguntas.
          </p>
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{scale.stem}</p>
          <button
            onClick={() => setShowWelcome(false)}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700"
          >
            Começar
          </button>
        </div>
      </CenteredCard>
    )
  }

  const item = scale.items[step]

  async function choose(value: number) {
    const next = { ...answers, [item.id]: value }
    setAnswers(next)
    // Autosave this answer (event handler, not effect).
    fetch(`/api/public/escalas/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { [item.id]: value } }),
    }).catch(() => {})

    if (step < total - 1) {
      setStep(step + 1)
    } else {
      await submit(next)
    }
  }

  async function submit(finalAnswers: Record<string, number>) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/escalas/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 410 || data.expired) {
        setState({ kind: "expired", message: data.error ?? "Este link expirou." })
        return
      }
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "Não foi possível enviar." })
        return
      }
      setState({
        kind: "done",
        message: data.message,
        riskEndorsed: !!data.riskEndorsed,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CenteredCard>
      <div className="space-y-5">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span>
              {step + 1} de {total}
            </span>
            <span>{scale.shortName}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${((step + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <p className="text-base font-medium leading-relaxed text-gray-900">{item.text}</p>

        <div className="space-y-2">
          {scale.options.map((opt) => {
            const selected = answers[item.id] === opt.value
            return (
              <button
                key={opt.value}
                disabled={submitting}
                onClick={() => choose(opt.value)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                  selected
                    ? "border-blue-600 bg-blue-50 font-medium text-blue-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            disabled={step === 0 || submitting}
            onClick={() => setStep(Math.max(0, step - 1))}
            className="inline-flex items-center gap-1 text-sm text-gray-500 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>
          {submitting && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
        </div>
      </div>
    </CenteredCard>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">{children}</div>
    </div>
  )
}
