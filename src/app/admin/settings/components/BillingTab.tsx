import { useState } from "react"
import { toast } from "sonner"
import { DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import type { TabProps } from "../types"
import { patchSettings } from "../types"

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
const labelClass = "block text-sm font-medium text-foreground mb-2"
const btnClass =
  "h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"

export default function BillingTab({ settings, onUpdate }: TabProps) {
  const [invoiceDueDay, setInvoiceDueDay] = useState(settings.invoiceDueDay)
  const [billingMode, setBillingMode] = useState(settings.billingMode)
  const [invoiceGrouping, setInvoiceGrouping] = useState(settings.invoiceGrouping)
  const [taxPercentage, setTaxPercentage] = useState(Number(settings.taxPercentage ?? 0))
  const [invoiceTemplate, setInvoiceTemplate] = useState(settings.invoiceMessageTemplate || "")
  const [paymentInfo, setPaymentInfo] = useState(settings.paymentInfo || "")
  const [saving, setSaving] = useState<string | null>(null)

  async function save(key: string, body: Record<string, unknown>) {
    setSaving(key)
    try {
      const updated = await patchSettings(body)
      onUpdate(updated)
      setBillingMode(updated.billingMode)
      setInvoiceGrouping(updated.invoiceGrouping)
      toast.success("Salvo com sucesso")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Invoice Due Day */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Dia de Vencimento da Fatura</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className={labelClass}>Dia do mês (1-28)</label>
            <input
              type="number"
              min={1}
              max={28}
              value={invoiceDueDay}
              onChange={(e) => setInvoiceDueDay(parseInt(e.target.value) || 15)}
              className={inputClass}
            />
          </div>
          <button type="button" onClick={() => save("due", { invoiceDueDay })} disabled={saving === "due"} className={btnClass}>
            {saving === "due" ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {/* Billing Mode */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Modo de Cobrança</h2>
        <p className="text-xs text-muted-foreground">Define como os valores são cobrados nas faturas.</p>
        {([
          { value: "PER_SESSION" as const, label: "Por sessão", desc: "Cada sessão realizada é cobrada individualmente." },
          { value: "MONTHLY_FIXED" as const, label: "Mensalidade fixa", desc: "Valor fixo mensal por paciente." },
        ]).map((opt) => (
          <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              checked={billingMode === opt.value}
              disabled={!!saving}
              onChange={() => {
                setBillingMode(opt.value)
                if (opt.value === "MONTHLY_FIXED") setInvoiceGrouping("MONTHLY")
                save("billing", {
                  billingMode: opt.value,
                  ...(opt.value === "MONTHLY_FIXED" ? { invoiceGrouping: "MONTHLY" } : {}),
                })
              }}
              className="mt-1"
            />
            <div>
              <span className="text-sm font-medium text-foreground">{opt.label}</span>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Invoice Grouping */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Agrupamento de Faturas</h2>
        {([
          { value: "MONTHLY" as const, label: "Mensal (uma fatura por mês)", desc: "Todas as sessões do mês em uma fatura." },
          { value: "PER_SESSION" as const, label: "Por Sessão (uma fatura por sessão)", desc: "Cada sessão gera uma fatura individual.", disabled: billingMode === "MONTHLY_FIXED" },
        ]).map((opt) => (
          <label key={opt.value} className={`flex items-start gap-3 ${opt.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
            <input
              type="radio"
              checked={invoiceGrouping === opt.value}
              disabled={!!saving || !!opt.disabled}
              onChange={() => {
                setInvoiceGrouping(opt.value)
                save("grouping", { invoiceGrouping: opt.value })
              }}
              className="mt-1"
            />
            <div>
              <span className="text-sm font-medium text-foreground">{opt.label}</span>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
          </label>
        ))}
        {billingMode === "MONTHLY_FIXED" && (
          <p className="text-xs text-muted-foreground">Agrupamento por sessão requer modo por sessão.</p>
        )}
      </div>

      {/* Tax Percentage */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Imposto para Repasse</h2>
        <p className="text-xs text-muted-foreground">Percentual descontado do bruto antes do repasse dos profissionais.</p>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className={labelClass}>Percentual (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={taxPercentage}
              onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <button type="button" onClick={() => save("tax", { taxPercentage })} disabled={saving === "tax"} className={btnClass}>
            {saving === "tax" ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {/* Invoice Template */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Modelo de Mensagem da Fatura</h2>
        <textarea
          rows={6}
          value={invoiceTemplate}
          onChange={(e) => setInvoiceTemplate(e.target.value)}
          placeholder={DEFAULT_INVOICE_TEMPLATE}
          className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none font-mono"
        />
        <p className="text-xs text-muted-foreground">
          {"Variaveis: {{paciente}}, {{mae}}, {{pai}}, {{valor}}, {{mes}}, {{ano}}, {{vencimento}}, {{sessoes}}, {{profissional}}, {{sessoes_regulares}}, {{sessoes_extras}}, {{sessoes_grupo}}, {{reunioes_escola}}, {{creditos}}, {{valor_sessao}}, {{detalhes}}"}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setInvoiceTemplate(DEFAULT_INVOICE_TEMPLATE)}
            className="h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Restaurar padrao
          </button>
          <button
            type="button"
            onClick={() => save("template", { invoiceMessageTemplate: invoiceTemplate || null })}
            disabled={saving === "template"}
            className={btnClass}
          >
            {saving === "template" ? "Salvando..." : "Salvar modelo"}
          </button>
        </div>
      </div>

      {/* Payment Info */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Dados para Pagamento</h2>
        <p className="text-xs text-muted-foreground">
          Informações exibidas no PDF da fatura (PIX, dados bancários, etc).
        </p>
        <textarea
          rows={3}
          value={paymentInfo}
          onChange={(e) => setPaymentInfo(e.target.value)}
          placeholder={"PIX: 12.345.678/0001-00 (CNPJ)\nBanco: Itaú\nAgência: 1234 / Conta: 56789-0"}
          className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => save("payment", { paymentInfo: paymentInfo || null })}
            disabled={saving === "payment"}
            className={btnClass}
          >
            {saving === "payment" ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
