"use client"

import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import type { DmedPayerView } from "./types"

export function DmedConferenceTable({ payers, grandTotal }: { payers: DmedPayerView[]; grandTotal: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(cpf: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cpf)) next.delete(cpf)
      else next.add(cpf)
      return next
    })
  }

  if (payers.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">Nenhum recebimento PJ no ano.</div>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Pagador</th>
            <th className="px-3 py-2">CPF</th>
            <th className="px-3 py-2 text-right">Total recebido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {payers.map((payer) => {
            const open = expanded.has(payer.cpf)
            const hasBenef = payer.beneficiaries.length > 0
            return (
              <Fragment key={payer.cpf}>
                <tr>
                  <td className="px-3 py-2">
                    {hasBenef && (
                      <button onClick={() => toggle(payer.cpf)} className="mr-1 align-middle text-muted-foreground">
                        {open ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}
                      </button>
                    )}
                    {payer.name}
                  </td>
                  <td className="px-3 py-2">{payer.cpf}</td>
                  <td className="px-3 py-2 text-right">{formatCurrencyBRL(payer.total)}</td>
                </tr>
                {open &&
                  payer.beneficiaries.map((b, i) => (
                    <tr key={`${payer.cpf}-${b.cpf || i}`} className="bg-muted/30 text-xs">
                      <td className="px-3 py-1.5 pl-8">
                        {b.name}
                        {b.birthDate && (
                          <span className="ml-2 text-muted-foreground">({formatDateBR(b.birthDate)})</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{b.cpf}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrencyBRL(b.total)}</td>
                    </tr>
                  ))}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold">
            <td className="px-3 py-2" colSpan={2}>
              Total geral
            </td>
            <td className="px-3 py-2 text-right">{formatCurrencyBRL(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
