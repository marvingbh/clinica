"use client"

import { Dialog } from "../Sheet"

export type MemberScope = "this_only" | "all_future"

interface MemberScopeDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (scope: MemberScope) => void
  action: "add" | "remove"
  patientName: string
  isProcessing?: boolean
}

export function MemberScopeDialog({
  isOpen,
  onClose,
  onSelect,
  action,
  patientName,
  isProcessing = false,
}: MemberScopeDialogProps) {
  const title = action === "add"
    ? `Adicionar ${patientName}`
    : `Remover ${patientName}`

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground mb-4">
        {action === "add"
          ? "Onde deseja adicionar este participante?"
          : "De onde deseja remover este participante?"}
      </p>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onSelect("this_only")}
          disabled={isProcessing}
          className="w-full h-12 px-4 rounded-xl border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="font-semibold">Apenas esta sessão</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            {action === "add"
              ? "Adiciona somente nesta data"
              : "Remove somente desta data"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelect("all_future")}
          disabled={isProcessing}
          className="w-full h-12 px-4 rounded-xl border border-primary/30 bg-primary/5 text-foreground text-sm font-medium hover:bg-primary/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="font-semibold">Esta e todas as futuras</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            {action === "add"
              ? "Adiciona como membro do grupo permanentemente"
              : "Remove do grupo a partir desta data"}
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        disabled={isProcessing}
        className="w-full h-10 mt-3 rounded-xl border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancelar
      </button>
    </Dialog>
  )
}
