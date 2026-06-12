"use client"

import { useState } from "react"
import { ThumbsUp, ThumbsDown } from "lucide-react"
import { toast } from "sonner"

interface AiFeedbackButtonsProps {
  usageId: string
}

type Feedback = "POSITIVE" | "NEGATIVE"

/** 👍/👎 feedback for a single generation, posted to the feedback endpoint. */
export function AiFeedbackButtons({ usageId }: AiFeedbackButtonsProps) {
  const [given, setGiven] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(feedback: Feedback) {
    if (busy || given) return
    setBusy(true)
    try {
      const res = await fetch(`/api/ai/usage/${usageId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      })
      if (!res.ok) throw new Error()
      setGiven(feedback)
      toast.success("Obrigado pelo feedback!")
    } catch {
      toast.error("Não foi possível registrar o feedback.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2" title="Este rascunho foi útil?">
      <button
        type="button"
        aria-label="Útil"
        disabled={busy || given !== null}
        onClick={() => void send("POSITIVE")}
        className={`rounded-md p-1.5 transition-colors disabled:cursor-not-allowed ${
          given === "POSITIVE" ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ThumbsUp size={15} />
      </button>
      <button
        type="button"
        aria-label="Não útil"
        disabled={busy || given !== null}
        onClick={() => void send("NEGATIVE")}
        className={`rounded-md p-1.5 transition-colors disabled:cursor-not-allowed ${
          given === "NEGATIVE" ? "text-destructive" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ThumbsDown size={15} />
      </button>
    </div>
  )
}
