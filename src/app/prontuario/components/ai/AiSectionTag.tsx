"use client"

import { Sparkles } from "lucide-react"

/** Per-section badge marking AI-generated content awaiting review. */
export function AiSectionTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <Sparkles size={11} />
      Gerado por IA — revise
    </span>
  )
}
