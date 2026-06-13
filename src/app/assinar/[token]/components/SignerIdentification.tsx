"use client"

import { useState } from "react"

interface Props {
  signerName: string
  onSubmit: (name: string, cpf: string) => void
  submitting: boolean
}

function maskCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function SignerIdentification({ signerName, onSubmit, submitting }: Props) {
  const [agreed, setAgreed] = useState(false)
  const [name, setName] = useState(signerName)
  const [cpf, setCpf] = useState("")

  const cpfDigits = cpf.replace(/\D/g, "")
  const canSubmit = agreed && name.trim().length >= 2 && cpfDigits.length === 11

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
        <span>Li e concordo com o conteúdo deste documento</span>
      </label>
      <label className="block text-sm">
        <span className="block text-muted-foreground mb-1">Nome completo</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3" />
      </label>
      <label className="block text-sm">
        <span className="block text-muted-foreground mb-1">CPF</span>
        <input inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" className="w-full h-10 rounded-md border border-input bg-background px-3" />
      </label>
      <button
        type="button"
        disabled={!canSubmit || submitting}
        onClick={() => onSubmit(name.trim(), cpfDigits)}
        className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
      >
        {submitting ? "Enviando..." : "Receber código"}
      </button>
    </div>
  )
}
