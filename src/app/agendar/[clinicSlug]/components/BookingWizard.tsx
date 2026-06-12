"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { addDaysISO, utcToSpDateISO } from "@/lib/booking"
import { ProfessionalPicker } from "./ProfessionalPicker"
import { WeekSlotPicker } from "./WeekSlotPicker"
import { IdentificationForm } from "./IdentificationForm"
import { BookingResult } from "./BookingResult"
import { ClosedNotice } from "./ClosedNotice"
import type {
  PublicClinicInfo,
  PublicDaySlots,
  PublicSlot,
  Modality,
  IdentificationData,
} from "./types"

type Phase = "loading" | "closed" | "error" | "professional" | "slots" | "identify" | "result"

const STEP_LABELS = ["Profissional", "Horário", "Seus dados"]

export function BookingWizard({
  clinicSlug,
  initialProfessionalSlug,
}: {
  clinicSlug: string
  initialProfessionalSlug?: string
}) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [info, setInfo] = useState<PublicClinicInfo | null>(null)
  const [closedPhone, setClosedPhone] = useState<string | null>(null)
  const [professionalSlug, setProfessionalSlug] = useState<string | null>(null)
  const [modality, setModality] = useState<Modality>("ONLINE")
  const [fromDate, setFromDate] = useState<string>(utcToSpDateISO(new Date()))
  const [days, setDays] = useState<PublicDaySlots[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [chosenSlot, setChosenSlot] = useState<PublicSlot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resultKind, setResultKind] = useState<"confirmed" | "pending" | "conflict">("pending")
  const [errorMsg, setErrorMsg] = useState("")

  const today = utcToSpDateISO(new Date())

  useMountEffect(() => {
    void loadClinic()
  })

  async function loadClinic() {
    try {
      const res = await fetch(`/api/public/booking/${clinicSlug}`)
      if (res.status === 404) {
        setPhase("error")
        setErrorMsg("Clínica não encontrada")
        return
      }
      const data = await res.json()
      if (data.closed) {
        setClosedPhone(data.clinicPhone ?? null)
        setPhase("closed")
        return
      }
      setInfo(data)
      setModality(data.settings.allowedModalities[0] ?? "ONLINE")
      if (initialProfessionalSlug && data.professionals.some((p: { slug: string }) => p.slug === initialProfessionalSlug)) {
        void selectProfessional(initialProfessionalSlug, today, data.settings.allowedModalities[0] ?? "ONLINE")
      } else {
        setPhase("professional")
      }
    } catch {
      setPhase("error")
      setErrorMsg("Erro de conexão. Tente novamente.")
    }
  }

  async function fetchSlots(slug: string, from: string): Promise<PublicDaySlots[]> {
    const res = await fetch(
      `/api/public/booking/${clinicSlug}/slots?professional=${encodeURIComponent(slug)}&from=${from}&days=7`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.days ?? []) as PublicDaySlots[]
  }

  async function selectProfessional(slug: string, from: string, mod: Modality) {
    setProfessionalSlug(slug)
    setModality(mod)
    setFromDate(from)
    setPhase("slots")
    setSlotsLoading(true)
    setDays(await fetchSlots(slug, from))
    setSlotsLoading(false)
  }

  async function navigateWeek(direction: -1 | 1) {
    if (!professionalSlug) return
    const next = addDaysISO(fromDate, direction * 7)
    setFromDate(next)
    setSlotsLoading(true)
    setDays(await fetchSlots(professionalSlug, next))
    setSlotsLoading(false)
  }

  async function submit(form: IdentificationData) {
    if (!professionalSlug || !chosenSlot) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/booking/${clinicSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalSlug,
          start: chosenSlot.start,
          modality,
          name: form.name,
          phone: form.phone,
          email: form.email,
          cpf: form.cpf || undefined,
          consent: form.consent,
          website: form.website || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        if (Array.isArray(data.refreshedDays)) setDays(data.refreshedDays)
        setResultKind("conflict")
        setPhase("result")
        return
      }
      if (!res.ok) {
        setErrorMsg(data.error || "Não foi possível concluir o agendamento.")
        setSubmitting(false)
        return
      }
      setResultKind(data.status === "confirmed" ? "confirmed" : "pending")
      setPhase("result")
    } catch {
      setErrorMsg("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  const stepIndex = phase === "professional" ? 0 : phase === "slots" ? 1 : phase === "identify" ? 2 : -1

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-8 bg-background">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-foreground">Agende sua sessão</h1>
            {info && <p className="text-sm text-muted-foreground mt-0.5">{info.clinic.name}</p>}
          </div>

          {stepIndex >= 0 && (
            <div className="flex items-center justify-center gap-2 mb-6 text-xs">
              {STEP_LABELS.map((label, i) => (
                <span
                  key={label}
                  className={i === stepIndex ? "font-semibold text-primary" : "text-muted-foreground"}
                >
                  {label}
                  {i < STEP_LABELS.length - 1 && <span className="mx-1 text-muted-foreground">·</span>}
                </span>
              ))}
            </div>
          )}

          {phase === "loading" && <LoadingSkeleton />}
          {phase === "closed" && <ClosedNotice clinicPhone={closedPhone} />}
          {phase === "error" && <p className="text-center text-foreground py-8">{errorMsg}</p>}

          {phase === "professional" && info && (
            <ProfessionalPicker
              professionals={info.professionals}
              onSelect={(slug) => selectProfessional(slug, today, modality)}
            />
          )}

          {phase === "slots" && info && (
            <WeekSlotPicker
              days={days}
              isLoading={slotsLoading}
              allowedModalities={info.settings.allowedModalities}
              modality={modality}
              onModalityChange={setModality}
              onPrevWeek={() => navigateWeek(-1)}
              onNextWeek={() => navigateWeek(1)}
              canGoPrev={fromDate > today}
              onSelectSlot={(slot) => {
                setChosenSlot(slot)
                setErrorMsg("")
                setPhase("identify")
              }}
            />
          )}

          {phase === "identify" && (
            <>
              {errorMsg && <p className="text-sm text-destructive mb-3">{errorMsg}</p>}
              <IdentificationForm isSubmitting={submitting} onSubmit={submit} />
            </>
          )}

          {phase === "result" && (
            <BookingResult
              kind={resultKind}
              onPickAnother={() => {
                setChosenSlot(null)
                setPhase("slots")
              }}
            />
          )}
        </div>
      </div>
    </main>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 bg-muted rounded" />
      ))}
    </div>
  )
}
