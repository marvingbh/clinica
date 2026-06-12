"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { AiCreditsBadge } from "./AiCreditsBadge"
import { AiFeedbackButtons } from "./AiFeedbackButtons"
import type { AiUsageInfo, NoteFormat, SectionDef } from "./types"

const ABORDAGENS = ["", "TCC", "Psicanálise", "ABA", "Sistêmica", "Humanista", "Outra"] as const

interface AiDraftPanelProps {
  patientId: string
  noteId?: string
  format: NoteFormat
  sections: SectionDef[]
  /** Called with the generated SectionMap (keyed by section id) + usage id. */
  onDraft: (sections: Record<string, string>, usageId: string) => void
}

export function AiDraftPanel({ patientId, noteId, format, sections, onDraft }: AiDraftPanelProps) {
  const [info, setInfo] = useState<AiUsageInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [abordagem, setAbordagem] = useState("")
  const [includeHistory, setIncludeHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastUsageId, setLastUsageId] = useState<string | null>(null)

  useMountEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai/usage")
        if (res.ok) setInfo(await res.json())
      } catch {
        /* non-critical: panel simply stays hidden */
      }
    })()
  })

  // Hide entirely when the clinic disabled AI, the plan has no credits, or the
  // user opted out. Derived from the fetched info — no state syncing.
  if (!info || !info.enabled || info.optedOut) return null

  const limitReached = info.limit !== null && info.remaining !== null && info.remaining <= 0

  async function generate() {
    if (input.trim().length < 10) {
      toast.error("Escreva ao menos 10 caracteres.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/ai/note-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          noteId,
          format,
          sections: sections.map((s) => ({ key: s.id, label: s.label })),
          abordagem: abordagem || undefined,
          roughInput: input,
          includeHistory,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) {
        toast.error(data.message ?? "Recurso de IA indisponível.")
        return
      }
      if (!res.ok) {
        toast.error("Não foi possível gerar o rascunho. Seu texto foi preservado.")
        return
      }
      onDraft(data.sections, data.usageId)
      setLastUsageId(data.usageId)
      setInfo((prev) => (prev ? { ...prev, remaining: data.credits.remaining } : prev))
      if (data.truncated) {
        toast.warning("Texto longo — apenas os primeiros caracteres foram considerados.")
      }
    } catch {
      toast.error("Não foi possível gerar o rascunho. Seu texto foi preservado.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles size={16} className="text-primary" />
          Gerar com IA
        </span>
        <AiCreditsBadge remaining={info.remaining} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-4">
          {limitReached ? (
            <p className="text-sm text-muted-foreground">
              Você atingiu o limite de {info.limit} gerações deste mês. Faça upgrade do plano para
              continuar gerando rascunhos com IA.
            </p>
          ) : (
            <>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="Anote os pontos principais da sessão — tópicos soltos ou transcrição colada"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-muted-foreground">Formato: {format} (do modelo da nota)</span>
                <label className="flex items-center gap-2">
                  Abordagem:
                  <select
                    value={abordagem}
                    onChange={(e) => setAbordagem(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1"
                  >
                    {ABORDAGENS.map((a) => (
                      <option key={a} value={a}>
                        {a || "—"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={includeHistory}
                  onChange={(e) => setIncludeHistory(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Incluir contexto das últimas notas assinadas
              </label>
              <div className="flex items-center justify-between gap-3">
                {lastUsageId ? <AiFeedbackButtons usageId={lastUsageId} /> : <span />}
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={busy}
                  className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Gerando rascunho…" : "Gerar rascunho"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
