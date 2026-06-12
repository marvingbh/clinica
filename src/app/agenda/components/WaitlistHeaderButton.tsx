"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { ListIcon } from "@/shared/components/ui/icons"
import { WaitlistSidePanel } from "./WaitlistSidePanel"

/**
 * Agenda header button: opens the waitlist side panel and shows a count badge
 * of active entries. Self-contained (fetches its own count) so it can be
 * dropped into the header without threading props through the agenda page.
 */
export function WaitlistHeaderButton() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  useMountEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/waitlist?status=ATIVA")
        if (res.ok) {
          const data = await res.json()
          setCount(Array.isArray(data.entries) ? data.entries.length : 0)
        }
      } catch {
        setCount(null)
      }
    })()
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative h-10 px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm"
        title="Lista de espera"
      >
        <ListIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Espera</span>
        {count !== null && count > 0 && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
            {count}
          </span>
        )}
      </button>
      {open && <WaitlistSidePanel isOpen={open} onClose={() => setOpen(false)} />}
    </>
  )
}
