"use client"

import { useState, useCallback } from "react"
import { useMountEffect } from "@/shared/hooks"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { formatCurrencyBRL, getMonthName } from "@/lib/financeiro/format"
import { CheckCircleIcon } from "@/shared/components/ui/icons"
import { toast } from "sonner"
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
        toast.success("Pagamento registrado")
        await fetchData()
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Erro ao registrar pagamento")
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
        toast.success("Pagamento desfeito")
        await fetchData()
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Erro ao desfazer pagamento")
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
        <SummaryCard
          label="Recebido"
          value={data.summary.totalReceived}
          sublabel={`${data.summary.percentReceived.toFixed(1)}% das faturas`}
          variant={
            data.summary.percentReceived >= 100
              ? "success"
              : data.summary.percentReceived > 0
              ? "warning"
              : "danger"
          }
        />
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
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-green-100 text-green-800">
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
              <th className="text-left py-3 px-4 font-medium">Horário</th>
              <th className="text-left py-3 px-4 font-medium">Paciente</th>
              <th className="text-center py-3 px-4 font-medium">Sessões</th>
              <th className="text-right py-3 px-4 font-medium">Bruto</th>
              <th className="text-right py-3 px-4 font-medium">Imposto</th>
              <th className="text-right py-3 px-4 font-medium">Líquido</th>
              <th className="text-right py-3 px-4 font-medium">Repasse</th>
              <th className="text-right py-3 px-4 font-medium">Recebido</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.invoiceId}
                className="border-b border-border last:border-0"
              >
                <td className="py-3 px-4 text-muted-foreground text-xs font-mono whitespace-nowrap">
                  {formatSlot(item.slot)}
                </td>
                <td className="py-3 px-4">{item.patientName}</td>
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
                <td className="text-right py-3 px-4">
                  <ReceivedCell paid={item.paidAmount} percent={item.percentPaid} />
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
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

function SummaryCard({ label, value, sublabel, highlight, variant }: {
  label: string; value: number; sublabel?: string; highlight?: boolean; variant?: "success" | "danger" | "warning"
}) {
  const colors = variant === "success"
    ? "bg-green-50 border-green-200"
    : variant === "danger"
    ? "bg-red-50 border-red-200"
    : variant === "warning"
    ? "bg-amber-50 border-amber-200"
    : highlight
    ? "bg-primary/5 border-primary/30"
    : ""

  const textColor = variant === "success"
    ? "text-green-700"
    : variant === "danger"
    ? "text-red-600"
    : variant === "warning"
    ? "text-amber-600"
    : highlight
    ? "text-primary"
    : ""

  return (
    <div className={`rounded-lg border border-border p-4 ${colors}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${textColor}`}>
        {formatCurrencyBRL(value)}
      </div>
      {sublabel && (
        <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>
      )}
    </div>
  )
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function formatSlot(slot: { dayOfWeek: number; time: string } | null): string {
  if (!slot) return "—"
  return `${WEEKDAY_LABELS[slot.dayOfWeek] ?? "?"} ${slot.time}`
}

function ReceivedCell({ paid, percent }: { paid: number; percent: number }) {
  const color =
    percent >= 100 ? "text-green-700"
    : percent > 0 ? "text-amber-600"
    : "text-muted-foreground"
  return (
    <div className={`inline-flex flex-col items-end leading-tight ${color}`}>
      <span className="font-medium">{formatCurrencyBRL(paid)}</span>
      <span className="text-[11px]">{percent.toFixed(1)}%</span>
    </div>
  )
}
