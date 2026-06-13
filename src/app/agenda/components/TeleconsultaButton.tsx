"use client"

import { useState } from "react"
import { Video, ExternalLink } from "lucide-react"
import { TeleconsultaModal } from "./TeleconsultaModal"

interface TeleconsultaButtonProps {
  appointmentId: string
  type: string
  modality: string | null
  status: string
  meetingUrl?: string | null
  /** Mark the consultation FINALIZADO after the call (reuses status transition). */
  onUpdateStatus?: (status: string, message: string) => Promise<void>
}

const ACTIVE_STATUSES = ["AGENDADO", "CONFIRMADO"]

/**
 * Renders the professional teleconsulta entry point for ONLINE consultations.
 * External meetingUrl opens in a new tab; otherwise the built-in room opens in
 * a full-screen modal. Hidden for non-ONLINE / non-CONSULTA / inactive status.
 */
export function TeleconsultaButton({
  appointmentId,
  type,
  modality,
  status,
  meetingUrl,
  onUpdateStatus,
}: TeleconsultaButtonProps) {
  const [open, setOpen] = useState(false)

  if (type !== "CONSULTA" || modality !== "ONLINE" || !ACTIVE_STATUSES.includes(status)) {
    return null
  }

  const baseClass =
    "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-brand-200 bg-brand-50 text-brand-700 text-[12px] font-medium hover:bg-brand-100 transition-colors"

  if (meetingUrl) {
    return (
      <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className={baseClass}>
        <ExternalLink className="w-3.5 h-3.5" />
        Abrir link da reunião
      </a>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={baseClass}>
        <Video className="w-3.5 h-3.5" />
        Iniciar teleconsulta
      </button>
      {open && (
        <TeleconsultaModal
          appointmentId={appointmentId}
          onClose={() => setOpen(false)}
          onUpdateStatus={onUpdateStatus}
        />
      )}
    </>
  )
}
