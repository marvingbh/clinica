"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useMountEffect, usePermission } from "@/shared/hooks"
import type { FormAnswers, FormField } from "@/lib/forms"
import type { FormResponseStatus } from "@prisma/client"
import { ResponseView } from "../../components/ResponseView"
import { ResponseStatusChip } from "../../components/ResponseStatusChip"

interface ResponseData {
  response: {
    id: string
    templateName: string
    version: number
    status: FormResponseStatus
    completedAt: string | null
  }
  fields: FormField[]
  answers: FormAnswers
  patient: { id: string; name: string }
}

type State = "loading" | "ready" | "forbidden" | "notfound"

export default function ResponseDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { canRead } = usePermission("forms")
  const [state, setState] = useState<State>("loading")
  const [data, setData] = useState<ResponseData | null>(null)

  useMountEffect(() => {
    let active = true
    async function load() {
      const res = await fetch(`/api/forms/responses/${params.id}`)
      if (!active) return
      if (res.status === 403) return setState("forbidden")
      if (!res.ok) return setState("notfound")
      setData(await res.json())
      setState("ready")
    }
    void load()
    return () => {
      active = false
    }
  })

  if (!canRead) return <div className="p-6 text-[14px] text-ink-600">Sem permissão.</div>
  if (state === "loading") return <div className="p-6 text-[14px] text-ink-500">Carregando...</div>
  if (state === "forbidden")
    return <div className="p-6 text-[14px] text-ink-600">Sem permissão para ver o conteúdo desta resposta.</div>
  if (state === "notfound" || !data)
    return <div className="p-6 text-[14px] text-ink-600">Resposta não encontrada.</div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => router.back()} className="text-[13px] text-ink-500 hover:underline">
        ← Voltar
      </button>
      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-ink-900">{data.response.templateName}</h1>
          <p className="text-[13px] text-ink-500 mt-0.5">
            {data.patient.name} • v{data.response.version}{" "}
            <span className="ml-1"><ResponseStatusChip status={data.response.status} /></span>
          </p>
        </div>
        <a
          href={`/api/forms/responses/${params.id}/pdf`}
          className="rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700"
        >
          Baixar PDF
        </a>
      </div>

      <div className="mt-5">
        <ResponseView fields={data.fields} answers={data.answers} />
      </div>
    </div>
  )
}
