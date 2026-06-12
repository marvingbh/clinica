"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { Dialog } from "./Sheet"
import { PhoneIcon, SendIcon, LoaderIcon } from "@/shared/components/ui/icons"

export interface SlotMatchCandidate {
  entryId: string
  patientId: string | null
  name: string
  phone: string | null
  isLead: boolean
  professionalMatch: boolean
  hasSameDayAppointment: boolean
  priorityNote: string | null
  preferencesSummary: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** The open slot to match against. */
  slot: {
    professionalProfileId: string
    start: string // ISO
    end: string // ISO
    modality: "ONLINE" | "PRESENCIAL" | null
  } | null
  /** Optional: open the create-appointment flow pre-filled for a candidate. */
  onSchedule?: (candidate: SlotMatchCandidate) => void
}

/**
 * Ranked list of waitlist candidates for an open slot. Each row can send a
 * manual offer (creates a WaitlistOffer + notification) or schedule directly.
 */
export function SlotMatchesDialog({ isOpen, onClose, slot, onSchedule }: Props) {
  const [candidates, setCandidates] = useState<SlotMatchCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useMountEffect(() => {
    if (!slot) return
    const params = new URLSearchParams({
      professionalProfileId: slot.professionalProfileId,
      start: slot.start,
      end: slot.end,
    })
    if (slot.modality) params.set("modality", slot.modality)
    ;(async () => {
      try {
        const res = await fetch(`/api/waitlist/matches?${params}`)
        if (res.ok) {
          const data = await res.json()
          setCandidates(data.candidates)
        }
      } finally {
        setLoading(false)
      }
    })()
  })

  async function sendOffer(c: SlotMatchCandidate) {
    if (!slot) return
    setSendingId(c.entryId)
    try {
      const res = await fetch(`/api/waitlist/${c.entryId}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStart: slot.start,
          slotEnd: slot.end,
          professionalProfileId: slot.professionalProfileId,
          modality: slot.modality,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao enviar oferta")
      toast.success("Oferta enviada")
      setCandidates((prev) => prev.filter((x) => x.entryId !== c.entryId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado")
    } finally {
      setSendingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Lista de espera — correspondências">
      {loading ? (
        <div className="flex items-center justify-center py-8 text-ink-500">
          <LoaderIcon className="w-5 h-5 animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-[13px] text-ink-500 py-6 text-center">
          Nenhum candidato na lista de espera para este horário.
        </p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {candidates.map((c) => (
            <div key={c.entryId} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <p className="font-medium text-[14px] text-ink-900">{c.name}</p>
                {c.isLead && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    Lead
                  </span>
                )}
                {c.hasSameDayAppointment && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">
                    Já tem sessão neste dia
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[12px] text-ink-500">
                {c.phone && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <PhoneIcon className="w-3 h-3" /> {c.phone}
                  </span>
                )}
                <span>{c.preferencesSummary}</span>
              </div>
              <div className="flex gap-2 mt-2">
                {!c.isLead && (
                  <button
                    type="button"
                    onClick={() => sendOffer(c)}
                    disabled={sendingId === c.entryId}
                    className="inline-flex items-center gap-1 px-3 h-9 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <SendIcon className="w-3.5 h-3.5" />
                    {sendingId === c.entryId ? "Enviando..." : "Enviar oferta"}
                  </button>
                )}
                {onSchedule && (
                  <button
                    type="button"
                    onClick={() => onSchedule(c)}
                    className="px-3 h-9 rounded-md border border-ink-300 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
                  >
                    Agendar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
