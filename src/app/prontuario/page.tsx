"use client"

import { useRequireAuth } from "@/shared/hooks"
import { ProntuarioBrowser } from "./components/ProntuarioBrowser"

export default function ProntuarioPage() {
  const { isReady } = useRequireAuth({ feature: "prontuario", minAccess: "READ" })

  if (!isReady) {
    return <div className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Prontuário</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Busque registros clínicos por paciente ou veja as evoluções pendentes.
      </p>
      <ProntuarioBrowser />
    </div>
  )
}
