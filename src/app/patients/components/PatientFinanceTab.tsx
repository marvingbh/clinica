"use client"

import { useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { Patient, formatCurrency } from "./types"
import { getFeeLabel } from "@/lib/financeiro/billing-labels"

interface InvoiceSummary {
  id: string
  month: number
  year: number
  totalAmount: string | number
  status: string
}

interface CreditSummary {
  id: string
  amount: string | number
  reason: string | null
  createdAt: string
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviada",
  PAID: "Paga",
  OVERDUE: "Atrasada",
  CANCELLED: "Cancelada",
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
}

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export function PatientFinanceTab({ patient, billingMode = "PER_SESSION" }: { patient: Patient; billingMode?: string }) {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [credits, setCredits] = useState<CreditSummary[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true)
  const [isLoadingCredits, setIsLoadingCredits] = useState(true)


  useEffect(() => {
    let cancelled = false

    async function fetchInvoices() {
      try {
        const res = await fetch(`/api/financeiro/faturas?patientId=${patient.id}`)
        if (!res.ok) throw new Error("Failed to fetch invoices")
        const data = await res.json()
        if (!cancelled) setInvoices(data.invoices || [])
      } catch {
        // silently fail - empty state will show
      } finally {
        if (!cancelled) setIsLoadingInvoices(false)
      }
    }

    async function fetchCredits() {
      try {
        const res = await fetch(`/api/financeiro/creditos?patientId=${patient.id}&status=available`)
        if (!res.ok) throw new Error("Failed to fetch credits")
        const data = await res.json()
        if (!cancelled) setCredits(data.credits || [])
      } catch {
        // silently fail - empty state will show
      } finally {
        if (!cancelled) setIsLoadingCredits(false)
      }
    }

    fetchInvoices()
    fetchCredits()

    return () => { cancelled = true }
  }, [patient.id])

  return (
    <div className="space-y-6">
      {/* Session Fee */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <label className="text-sm text-muted-foreground">{getFeeLabel(billingMode)}</label>
        <p className="text-foreground font-semibold text-lg">{formatCurrency(patient.sessionFee)}</p>
      </div>

      {/* Credits */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Creditos Disponiveis</h3>
        {isLoadingCredits ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        ) : credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum credito disponivel.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              {credits.length} credito{credits.length !== 1 ? "s" : ""} disponivel{credits.length !== 1 ? "is" : ""}
            </p>
            {credits.map((credit) => (
              <div
                key={credit.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-background text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">{formatCurrency(credit.amount)}</span>
                  {credit.reason && (
                    <span className="text-muted-foreground ml-2 text-xs">{credit.reason}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(credit.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoices */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Faturas Recentes</h3>
        {isLoadingInvoices ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Periodo</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Valor</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">
                      {MONTH_NAMES[inv.month - 1]}/{inv.year}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground font-medium">
                      {formatCurrency(inv.totalAmount)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        INVOICE_STATUS_COLORS[inv.status] || "bg-gray-100 text-gray-700"
                      }`}>
                        {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
