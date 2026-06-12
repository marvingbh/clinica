"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { BookingRequestDetail } from "./BookingRequestDetail"
import type { BookingRequestItem, BookingStatus } from "./types"

const FILTERS: { value: BookingStatus; label: string }[] = [
  { value: "PENDING", label: "Pendentes" },
  { value: "APPROVED", label: "Aprovadas" },
  { value: "REJECTED", label: "Rejeitadas" },
  { value: "EXPIRED", label: "Expiradas" },
]

export function BookingRequestList() {
  const [status, setStatus] = useState<BookingStatus>("PENDING")
  const [items, setItems] = useState<BookingRequestItem[]>([])
  const [loading, setLoading] = useState(true)

  useMountEffect(() => {
    void load("PENDING")
  })

  async function load(next: BookingStatus) {
    setLoading(true)
    try {
      const res = await fetch(`/api/booking-requests?status=${next}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.requests ?? [])
      } else {
        setItems([])
      }
    } finally {
      setLoading(false)
    }
  }

  function changeFilter(next: BookingStatus) {
    setStatus(next)
    void load(next)
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4" style={{ scrollbarWidth: "none" }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => changeFilter(f.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              status === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhuma solicitação.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <BookingRequestDetail key={item.id} request={item} onActed={() => load(status)} />
          ))}
        </ul>
      )}
    </div>
  )
}
