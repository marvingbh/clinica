"use client"

import { useState } from "react"

interface Props {
  onConfirm: (reason: string) => void
  onCancel: () => void
  submitting: boolean
}

export function DeclineDialog({ onConfirm, onCancel, submitting }: Props) {
  const [reason, setReason] = useState("")
  return (
    <div className="space-y-3 rounded-md border border-input p-4">
      <p className="text-sm font-medium">Não concordo com este documento</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 h-10 rounded-md border border-input text-sm">
          Voltar
        </button>
        <button type="button" disabled={submitting} onClick={() => onConfirm(reason)} className="flex-1 h-10 rounded-md bg-red-600 text-white text-sm font-medium disabled:opacity-50">
          Confirmar recusa
        </button>
      </div>
    </div>
  )
}
