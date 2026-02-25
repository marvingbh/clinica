"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useFinanceiroContext } from "../context/FinanceiroContext"

interface Credit {
  id: string
  reason: string
  createdAt: string
  consumedAt: string | null
  consumedByInvoiceId: string | null
  patient: { id: string; name: string }
  originAppointment: { id: string; scheduledAt: string }
  consumedByInvoice: { id: string; referenceMonth: number; referenceYear: number } | null
}

export default function CreditosPage() {
  const { year, month } = useFinanceiroContext()
  const [credits, setCredits] = useState<Credit[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")

  const fetchCredits = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("year", String(year))
    if (month !== null) params.set("month", String(month))
    if (statusFilter) params.set("status", statusFilter)
    fetch(`/api/financeiro/creditos?${params}`)
      .then(r => r.json())
      .then(setCredits)
      .finally(() => setLoading(false))
  }, [year, month, statusFilter])

  useEffect(() => { fetchCredits() }, [fetchCredits])

  return (
    <div>
      <div className="flex gap-1 mb-6">
        {[
          { label: "Todos", value: "" },
          { label: "Disponíveis", value: "available" },
          { label: "Utilizados", value: "consumed" },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              statusFilter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      ) : credits.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhum crédito encontrado
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-medium">Paciente</th>
                <th className="text-left py-3 px-4 font-medium">Motivo</th>
                <th className="text-center py-3 px-4 font-medium">Data</th>
                <th className="text-center py-3 px-4 font-medium">Status</th>
                <th className="text-center py-3 px-4 font-medium">Fatura</th>
              </tr>
            </thead>
            <tbody>
              {credits.map(credit => {
                const isAvailable = !credit.consumedByInvoiceId
                return (
                  <tr key={credit.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 px-4 font-medium">{credit.patient.name}</td>
                    <td className="py-3 px-4">{credit.reason}</td>
                    <td className="text-center py-3 px-4">{new Date(credit.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="text-center py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        isAvailable
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {isAvailable ? "Disponível" : "Utilizado"}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      {credit.consumedByInvoice ? (
                        <Link
                          href={`/financeiro/faturas/${credit.consumedByInvoiceId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {String(credit.consumedByInvoice.referenceMonth).padStart(2, "0")}/{credit.consumedByInvoice.referenceYear}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
