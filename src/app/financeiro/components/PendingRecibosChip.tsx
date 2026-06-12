"use client"

import { useState } from "react"
import Link from "next/link"
import { Receipt } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"

/**
 * Self-contained chip showing the count of pending Receita Saúde receipts.
 * Hides itself when the count is 0 or the user lacks the fiscal feature (403).
 */
export function PendingRecibosChip() {
  const [count, setCount] = useState<number | null>(null)

  useMountEffect(() => {
    fetch("/api/financeiro/fiscal/pending-count")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setCount(data.pendingRecibos))
      .catch(() => setCount(0))
  })

  if (!count || count <= 0) return null

  return (
    <Link
      href="/financeiro/receita-saude"
      className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300"
    >
      <Receipt size={13} />
      {count} {count === 1 ? "recibo pendente" : "recibos pendentes"}
    </Link>
  )
}
