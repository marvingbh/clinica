"use client"

import { useState } from "react"
import { useRequireAuth, useMountEffect } from "@/shared/hooks"
import { PendingNotesList } from "./components/PendingNotesList"

interface PendingItem {
  appointmentId: string
  patientId: string
  patientName: string | null
  scheduledAt: string
}

export default function ProntuarioPendingPage() {
  const { isReady } = useRequireAuth({ feature: "prontuario", minAccess: "WRITE" })
  const [pending, setPending] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await fetch("/api/prontuario/pending")
      if (res.ok) {
        const data = await res.json()
        setPending(data.pending ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useMountEffect(() => {
    void load()
  })

  if (!isReady) {
    return <div className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Prontuário</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Sessões finalizadas sem evolução registrada (últimos 30 dias).
      </p>
      {loading ? (
        <div className="space-y-3">
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        <PendingNotesList pending={pending} />
      )}
    </div>
  )
}
