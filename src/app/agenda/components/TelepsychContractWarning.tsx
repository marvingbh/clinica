"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { needsTelepsychContractWarning } from "@/lib/assinaturas/telepsych"

interface Props {
  patientId: string | null
  modality: string | null
  /** Appointment type; CONSULTA-only sheets can pass "CONSULTA". */
  type?: string
}

interface Status {
  hasSignedContract: boolean
  pendingEnvelopeId?: string
  contractDocumentId?: string
}

/**
 * Res. CFP 09/2024 guard. Self-contained: remounts (and re-fetches) whenever
 * patientId/modality change via its React `key`. Non-blocking warning.
 */
export function TelepsychContractWarning({ patientId, modality, type = "CONSULTA" }: Props) {
  const [status, setStatus] = useState<Status | null>(null)
  const relevant = type === "CONSULTA" && modality === "ONLINE" && !!patientId

  useMountEffect(() => {
    if (!relevant || !patientId) return
    fetch(`/api/assinaturas/contrato-status?patientId=${patientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null))
  })

  if (!relevant || !status) return null
  if (!needsTelepsychContractWarning({ type, modality, hasSignedContract: status.hasSignedContract })) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800" role="alert">
      <span>Este paciente não possui contrato terapêutico assinado (Res. CFP 09/2024).</span>
      {patientId && (
        <a href={`/patients?id=${patientId}&tab=documentos`} className="self-start rounded-md border border-orange-300 bg-white px-2 py-1 text-xs font-medium hover:bg-orange-100">
          {status.contractDocumentId ? "Enviar para assinatura" : "Gerar contrato"}
        </a>
      )}
      {status.pendingEnvelopeId && <span className="text-xs">Há um envio de contrato aguardando assinatura.</span>}
    </div>
  )
}
