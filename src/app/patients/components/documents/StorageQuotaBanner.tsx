"use client"

import { AlertTriangle } from "lucide-react"

/** Quota-exceeded banner with a CTA toward the billing page. */
export function StorageQuotaBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p>{message}</p>
        <a href="/admin/settings" className="font-medium underline">
          Ver plano e armazenamento
        </a>
      </div>
    </div>
  )
}
