"use client"

import { Sparkles } from "lucide-react"

interface AiDisclosureDialogProps {
  open: boolean
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

const DISCLOSURE_BODY =
  "Ao habilitar, trechos digitados pelos profissionais serão enviados de forma pseudonimizada (sem nome, CPF, telefone ou e-mail do paciente) a um provedor de IA (Anthropic) exclusivamente para gerar o rascunho, em conformidade com a LGPD (art. 7º, V — execução de contrato; operador sob instrução do controlador). O conteúdo não é armazenado por nós nem utilizado para treinar modelos. Cada uso é registrado em log de auditoria, sem conteúdo clínico. O profissional permanece integralmente responsável pelo registro (CFP). Cada profissional pode se excluir individualmente nas configurações de perfil."

/** LGPD-style disclosure shown before enabling the clinic AI assistant. */
export function AiDisclosureDialog({ open, busy, onConfirm, onCancel }: AiDisclosureDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-lg bg-card border border-border p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Termos de uso do assistente de IA</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{DISCLOSURE_BODY}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 px-4 rounded-md border border-input text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Habilitando..." : "Aceitar e habilitar"}
          </button>
        </div>
      </div>
    </div>
  )
}
