"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useMountEffect } from "@/shared/hooks"
import type { FormAnswers, FormField } from "@/lib/forms"
import { FillForm } from "./components/FillForm"
import { ExpiredScreen } from "./components/ExpiredScreen"
import { DoneScreen } from "./components/DoneScreen"

interface FormData {
  clinicName: string
  formName: string
  patientFirstName: string
  fields: FormField[]
  answers: FormAnswers
}

type PageState = "loading" | "ready" | "expired" | "completed" | "invalid"

export default function PublicFormPage() {
  const params = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>("loading")
  const [data, setData] = useState<FormData | null>(null)

  useMountEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`/api/public/forms/${params.token}`)
        const body = await res.json().catch(() => ({}))
        if (!active) return
        if (res.status === 410 || body.expired) return setState("expired")
        if (res.status === 409 || body.completed) return setState("completed")
        if (!res.ok) return setState("invalid")
        setData(body)
        setState("ready")
      } catch {
        if (active) setState("invalid")
      }
    }
    void load()
    return () => {
      active = false
    }
  })

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-[14px] text-ink-500">Carregando...</p>
      </div>
    )
  }

  if (state === "expired") return <ExpiredScreen />
  if (state === "completed") return <DoneScreen />

  if (state === "invalid" || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-canvas">
        <h1 className="text-[18px] font-semibold text-ink-900">Link inválido</h1>
        <p className="mt-2 text-[14px] text-ink-600 max-w-xs">
          Verifique o link recebido ou peça um novo à clínica.
        </p>
      </div>
    )
  }

  return (
    <FillForm
      token={params.token}
      clinicName={data.clinicName}
      formName={data.formName}
      fields={data.fields}
      initialAnswers={data.answers}
    />
  )
}
