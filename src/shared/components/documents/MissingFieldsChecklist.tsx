"use client"

import { AlertTriangle } from "lucide-react"
import type { MissingFieldDTO } from "./types"

interface Props {
  missing: MissingFieldDTO[]
}

const QUICK_FIX_LABELS: Record<string, string> = {
  patientCpf: "Completar cadastro",
  crp: "Editar perfil",
  professionalCpfCnpj: "Editar perfil",
  sessionList: "Ver faturas",
  totalValue: "Ver faturas",
}

export function MissingFieldsChecklist({ missing }: Props) {
  if (missing.length === 0) return null
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4" />
        Faltam dados para gerar este documento
      </div>
      <ul className="mt-2 space-y-1">
        {missing.map((m) => (
          <li key={m.key} className="flex items-center justify-between gap-3 text-amber-900">
            <span>{m.label}</span>
            {m.quickFixPath && (
              <a
                href={m.quickFixPath}
                className="shrink-0 text-amber-700 underline hover:text-amber-900"
              >
                {QUICK_FIX_LABELS[m.key] ?? "Corrigir"}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
