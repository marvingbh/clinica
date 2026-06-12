"use client"

import { AlertTriangle } from "lucide-react"

/** Fixed banner shown while AI-generated content remains unreviewed (CFP). */
export function AiReviewBanner() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>
        Conteúdo gerado por IA — revise antes de assinar. O profissional é responsável pelo conteúdo
        do registro (Res. CFP nº 11/2018).
      </span>
    </div>
  )
}
