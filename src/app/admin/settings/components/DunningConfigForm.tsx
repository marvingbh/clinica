"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"

const schema = z.object({
  enabled: z.boolean(),
  offsetsText: z.string(),
  sendWhatsApp: z.boolean(),
  sendEmail: z.boolean(),
  maxAttempts: z.number().int().min(1).max(12),
  linkExpirationDays: z.number().int().min(1).max(30),
  autoChargeOnInvoiceCreation: z.boolean(),
})
type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  enabled: false,
  offsetsText: "-3, 0, 3, 7",
  sendWhatsApp: true,
  sendEmail: true,
  maxAttempts: 4,
  linkExpirationDays: 7,
  autoChargeOnInvoiceCreation: false,
}

function parseOffsets(text: string): number[] {
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= -30 && n <= 60)
    .slice(0, 8)
}

/** Régua de cobrança configuration form. monthlyMode toggles the auto-charge field. */
export default function DunningConfigForm({ monthlyMode }: { monthlyMode: boolean }) {
  const [loading, setLoading] = useState(true)
  const { register, handleSubmit, reset, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  useMountEffect(() => {
    fetch("/api/clinic/payments/dunning-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          reset({
            enabled: data.config.enabled,
            offsetsText: (data.config.offsets as number[]).join(", "),
            sendWhatsApp: data.config.sendWhatsApp,
            sendEmail: data.config.sendEmail,
            maxAttempts: data.config.maxAttempts,
            linkExpirationDays: data.config.linkExpirationDays,
            autoChargeOnInvoiceCreation: data.config.autoChargeOnInvoiceCreation,
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  })

  async function onSubmit(data: FormData) {
    const offsets = parseOffsets(data.offsetsText)
    if (offsets.length === 0) {
      toast.error("Informe ao menos um dia de cobrança (ex.: -3, 0, 3, 7)")
      return
    }
    try {
      const res = await fetch("/api/clinic/payments/dunning-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: data.enabled,
          offsets,
          sendWhatsApp: data.sendWhatsApp,
          sendEmail: data.sendEmail,
          maxAttempts: data.maxAttempts,
          linkExpirationDays: data.linkExpirationDays,
          autoChargeOnInvoiceCreation: data.autoChargeOnInvoiceCreation,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Configurações de cobrança salvas")
    } catch {
      toast.error("Erro ao salvar configurações")
    }
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />

  const inputClass =
    "w-full h-11 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
  const labelClass = "block text-sm font-medium text-foreground mb-1.5"

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Régua de cobrança</h3>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" {...register("enabled")} className="h-4 w-4 rounded border-input text-primary" />
        <span className="text-sm text-foreground">Ativar régua de cobrança automática</span>
      </label>

      <div>
        <label className={labelClass}>Dias de envio (relativos ao vencimento)</label>
        <input type="text" {...register("offsetsText")} placeholder="-3, 0, 3, 7" className={inputClass} />
        <p className="mt-1 text-xs text-muted-foreground">
          Negativo = antes do vencimento, 0 = no dia, positivo = após. Máximo de 8 valores.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" {...register("sendWhatsApp")} className="h-4 w-4 rounded border-input text-primary" />
          <span className="text-sm text-foreground">Enviar por WhatsApp</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" {...register("sendEmail")} className="h-4 w-4 rounded border-input text-primary" />
          <span className="text-sm text-foreground">Enviar por e-mail</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Máx. de tentativas por fatura</label>
          <input type="number" min={1} max={12} {...register("maxAttempts", { valueAsNumber: true })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Validade do link (dias)</label>
          <input type="number" min={1} max={30} {...register("linkExpirationDays", { valueAsNumber: true })} className={inputClass} />
        </div>
      </div>

      {monthlyMode && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" {...register("autoChargeOnInvoiceCreation")} className="mt-1 h-4 w-4 rounded border-input text-primary" />
          <div>
            <span className="text-sm text-foreground">Gerar cobrança automaticamente ao criar fatura mensal</span>
            <p className="text-xs text-muted-foreground mt-0.5">Disponível para clínicas com cobrança mensal fixa.</p>
          </div>
        </label>
      )}

      <button
        type="submit"
        disabled={formState.isSubmitting}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar configurações
      </button>
    </form>
  )
}
