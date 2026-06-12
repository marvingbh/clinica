"use client"

import { useState } from "react"
import Link from "next/link"
import { useMountEffect } from "@/shared/hooks"
import { Sheet } from "./Sheet"
import { LoaderIcon, PhoneIcon } from "@/shared/components/ui/icons"
import { professionalLabel } from "@/lib/waitlist"

interface CompactEntry {
  id: string
  name: string
  phone: string | null
  professionalName: string | null
  preferencesSummary: string
  isLead: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

/**
 * Compact side panel listing the clinic's active waitlist entries, with a link
 * to the full management page. Opened from the agenda header.
 */
export function WaitlistSidePanel({ isOpen, onClose }: Props) {
  const [entries, setEntries] = useState<CompactEntry[]>([])
  const [loading, setLoading] = useState(true)

  useMountEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/waitlist?status=ATIVA")
        if (res.ok) {
          const data = await res.json()
          setEntries(data.entries)
        }
      } finally {
        setLoading(false)
      }
    })()
  })

  if (!isOpen) return null

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Lista de espera">
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-ink-500">
            <LoaderIcon className="w-5 h-5 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-[13px] text-ink-500 py-4 text-center">
            Nenhuma entrada ativa na lista de espera.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[13px] text-ink-900">{e.name}</p>
                  {e.isLead && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Lead
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[12px] text-ink-500">
                  {e.phone && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <PhoneIcon className="w-3 h-3" /> {e.phone}
                    </span>
                  )}
                  <span>{professionalLabel(e.professionalName)}</span>
                </div>
                <p className="text-[12px] text-ink-500 mt-0.5">{e.preferencesSummary}</p>
              </div>
            ))}
          </div>
        )}

        <Link
          href="/espera"
          className="block text-center text-[13px] text-primary hover:underline pt-2"
        >
          Ver tudo
        </Link>
      </div>
    </Sheet>
  )
}
