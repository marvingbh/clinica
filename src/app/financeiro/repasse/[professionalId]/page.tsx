"use client"

import { useState, useCallback } from "react"
import { useMountEffect } from "@/shared/hooks"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { formatCurrencyBRL, getMonthName } from "@/lib/financeiro/format"
import { CheckCircleIcon } from "@/shared/components/ui/icons"
import type { RepasseDetailData } from "../types"

export default function RepasseDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const professionalId = params.professionalId as string
  const year = searchParams.get("year")
  const month = searchParams.get("month")

  const [data, setData] = useState<RepasseDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  const fetchData = useCallback(async () => {
    if (!year || !month) return
    try {
      const res = await fetch(
        `/api/financeiro/repasse/${professionalId}?year=${year}&month=${month}`
      )
      if (res.ok) {
        setData(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [professionalId, year, month])

  useMountEffect(() => { fetchData() })

  const handleMarkAsPaid = async () => {
    if (!year || !month) return
    setPaying(true)
    try {
      const res = await fetch(`/api/financeiro/repasse/${professionalId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: parseInt(year), month: parseInt(month) }),
      })
      if (res.ok) {
        await fetchData()
      }
    } finally {
      setPaying(false)
    }
  }

  const handleUndoPayment = async () => {
    if (!year || !month) return
    setPaying(true)
    try {
      const res = await fetch(
        `/api/financeiro/repasse/${professionalId}/pay?year=${year}&month=${month}`,
        { method: "DELETE" },
      )
      if (res.ok) {
        await fetchData()
      }
    } finally {
      setPaying(false)
    }
  }

  if (!year || !month) {
    return <div className="text-destructive">Parâmetros de ano/mês ausentes</div>
  }
  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  }
  if (!data) {
    return <div className="text-destructive">Repasse não encontrado</div>
  }

  const isPaid = data.payment !== null
  const saldo = isPaid ? data.adjustment : data.summary.totalRepasse

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/financeiro/repasse"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Voltar
        </Link>
        <h2 className="text-xl font-bold mt-1">
          Repasse &mdash; {data.professional.name}
        </h2>
        <p className="text-muted-foreground text-sm">
          {getMonthName(data.month)} {data.year} &bull; Imposto: {data.taxPercent}%
          &bull; Repasse: {data.repassePercent}%
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard label="Total Bruto" value={data.summary.totalGross} />
        <SummaryCard label="Imposto" value={data.summary.totalTax} />
        <SummaryCard label="Líquido" value={data.summary.totalAfterTax} />
        <SummaryCard
          label="Repasse Total"
          value={data.summary.totalRepasse}
          highlight
        />
        <SummaryCard
          label="Já Pago"
          value={data.payment?.paidAmount ?? 0}
          variant={isPaid ? "success" : undefined}
        />
        <SummaryCard
          label="Saldo"
          value={saldo}
          variant={saldo < 0 ? "danger" : saldo > 0 ? "warning" : undefined}
        />
      </div>

      {/* Payment action */}
      <div className="flex items-center gap-3">
        {isPaid ? (
          <>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              <CheckCircleIcon className="w-4 h-4" />
              Pago em {new Date(data.payment!.paidAt).toLocaleDateString("pt-BR")}
            </span>
            <button
              onClick={handleUndoPayment}
              disabled={paying}
              className="text-sm text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              {paying ? "..." : "Desfazer pagamento"}
            </button>
          </>
        ) : (
          <button
            onClick={handleMarkAsPaid}
            disabled={paying || data.summary.totalRepasse === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <CheckCircleIcon className="w-4 h-4" />
            {paying ? "Processando..." : "Marcar como pago"}
          </button>
        )}
      </div>

      {/* Per-invoice line items */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left py-3 px-4 font-medium">Paciente</th>
              <th className="text-center py-3 px-4 font-medium">Sessões</th>
              <th className="text-right py-3 px-4 font-medium">Bruto</th>
              <th className="text-right py-3 px-4 font-medium">Imposto</th>
              <th className="text-right py-3 px-4 font-medium">Líquido</th>
              <th className="text-right py-3 px-4 font-medium">Repasse</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.invoiceId}
                className="border-b border-border last:border-0"
              >
                <td className="py-3 px-4">
                  {item.patientName}
                  {item.note && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                      ({item.note})
                    </span>
                  )}
                </td>
                <td className="text-center py-3 px-4">{item.totalSessions}</td>
                <td className="text-right py-3 px-4">
                  {formatCurrencyBRL(item.grossValue)}
                </td>
                <td className="text-right py-3 px-4">
                  {formatCurrencyBRL(item.taxAmount)}
                </td>
                <td className="text-right py-3 px-4">
                  {formatCurrencyBRL(item.afterTax)}
                </td>
                <td className="text-right py-3 px-4 font-medium">
                  {formatCurrencyBRL(item.repasseValue)}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhuma fatura encontrada neste período
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, highlight, variant }: {
  label: string; value: number; highlight?: boolean; variant?: "success" | "danger" | "warning"
}) {
  const colors = variant === "success"
    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
    : variant === "danger"
    ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
    : variant === "warning"
    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
    : highlight
    ? "bg-primary/5 border-primary/30"
    : ""

  const textColor = variant === "success"
    ? "text-green-700 dark:text-green-300"
    : variant === "danger"
    ? "text-red-600 dark:text-red-400"
    : variant === "warning"
    ? "text-amber-600 dark:text-amber-400"
    : highlight
    ? "text-primary"
    : ""

  return (
    <div className={`rounded-lg border border-border p-4 ${colors}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${textColor}`}>
        {formatCurrencyBRL(value)}
      </div>
    </div>
  )
}
