"use client"

import { useRef, useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import type { JoinInfo } from "@/lib/telehealth"
import { JitsiRoom } from "@/shared/components/telehealth/JitsiRoom"
import { PreJoinScreen } from "./PreJoinScreen"
import { WaitingScreen } from "./WaitingScreen"
import { JoinErrorScreen, type JoinErrorKind } from "./JoinErrorScreen"
import { Spinner } from "@/shared/components/ui/button"

type Step = "loading" | "prejoin" | "waiting" | "inroom" | "error"

interface ResolveResponse {
  state: string
  scheduledAt?: string
  patientFirstName?: string
  professionalName?: string
  clinicName?: string
  clinicPhone?: string | null
  professionalJoined?: boolean
  join?: JoinInfo
}

const POLL_MS = 10_000

export function TeleconsultaFlow({ token }: { token: string }) {
  const [step, setStep] = useState<Step>("loading")
  const [data, setData] = useState<ResolveResponse | null>(null)
  const [errorKind, setErrorKind] = useState<JoinErrorKind>("INVALID")
  const [displayName, setDisplayName] = useState("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function load() {
    try {
      const res = await fetch(`/api/public/teleconsulta/${token}`)
      const body: ResolveResponse = await res.json().catch(() => ({ state: "INVALID" }))
      if (!res.ok) {
        setErrorKind("INVALID")
        setStep("error")
        return
      }
      setData(body)
      if (body.state === "OK") {
        setDisplayName(body.patientFirstName ?? "Paciente")
        setStep("prejoin")
      } else {
        setErrorKind(body.state as JoinErrorKind)
        setStep("error")
      }
    } catch {
      setErrorKind("CONNECTION")
      setStep("error")
    }
  }

  useMountEffect(() => {
    load()
    return () => stopPolling()
  })

  function handleEnter(name: string) {
    setDisplayName(name)
    if (data?.professionalJoined) {
      setStep("inroom")
    } else {
      setStep("waiting")
      startPolling()
    }
  }

  function startPolling() {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/teleconsulta/${token}/status`)
        const body = await res.json().catch(() => null)
        if (!res.ok || !body) return
        if (body.state !== "OK") {
          stopPolling()
          setErrorKind(body.state as JoinErrorKind)
          setStep("error")
          return
        }
        if (body.professionalJoined) {
          stopPolling()
          setStep("inroom")
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS)
  }

  if (step === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (step === "error") {
    return (
      <JoinErrorScreen
        kind={errorKind}
        scheduledAt={data?.scheduledAt}
        clinicPhone={data?.clinicPhone}
      />
    )
  }

  if (step === "prejoin" && data) {
    return (
      <PreJoinScreen
        clinicName={data.clinicName ?? "Clínica"}
        professionalName={data.professionalName ?? "Profissional"}
        scheduledAt={data.scheduledAt ?? new Date().toISOString()}
        defaultName={data.patientFirstName ?? "Paciente"}
        onEnter={handleEnter}
      />
    )
  }

  if (step === "waiting" && data) {
    return <WaitingScreen scheduledAt={data.scheduledAt ?? new Date().toISOString()} />
  }

  if (step === "inroom" && data?.join) {
    const join: JoinInfo = { ...data.join, displayName }
    return (
      <div className="h-screen w-screen">
        <JitsiRoom
          join={join}
          onLeft={() => setStep("prejoin")}
          onFailed={() => {
            setErrorKind("CONNECTION")
            setStep("error")
          }}
        />
      </div>
    )
  }

  return <JoinErrorScreen kind="INVALID" />
}
