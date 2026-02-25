"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { usePermission } from "@/shared/hooks/usePermission"
import { DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
]

const settingsSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  timezone: z.string().min(1, "Timezone é obrigatório"),
  defaultSessionDuration: z
    .number()
    .int()
    .min(15, "Duração mínima é 15 minutos")
    .max(180, "Duração máxima é 180 minutos"),
  minAdvanceBooking: z
    .number()
    .int()
    .min(0, "Valor mínimo é 0 horas")
    .max(168, "Valor máximo é 168 horas (7 dias)"),
  reminderHours: z.string(),
})

type SettingsFormData = z.infer<typeof settingsSchema>

interface ClinicSettings {
  id: string
  name: string
  timezone: string
  defaultSessionDuration: number
  minAdvanceBooking: number
  reminderHours: number[]
  invoiceMessageTemplate: string | null
  billingMode: "PER_SESSION" | "MONTHLY_FIXED"
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { canRead } = usePermission("clinic_settings")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<ClinicSettings | null>(null)
  const [invoiceTemplate, setInvoiceTemplate] = useState<string>("")
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [billingMode, setBillingMode] = useState<"PER_SESSION" | "MONTHLY_FIXED">("PER_SESSION")
  const [isSavingBillingMode, setIsSavingBillingMode] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
  })

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/settings")
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch settings")
      }
      const data = await response.json()
      setSettings(data.settings)
      setInvoiceTemplate(data.settings.invoiceMessageTemplate || "")
      setBillingMode(data.settings.billingMode || "PER_SESSION")
      reset({
        name: data.settings.name,
        timezone: data.settings.timezone,
        defaultSessionDuration: data.settings.defaultSessionDuration,
        minAdvanceBooking: data.settings.minAdvanceBooking,
        reminderHours: data.settings.reminderHours.join(", "),
      })
    } catch {
      toast.error("Erro ao carregar configurações")
    } finally {
      setIsLoading(false)
    }
  }, [router, reset])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      if (!canRead) {
        toast.error("Sem permissao para acessar esta pagina")
        router.push("/")
        return
      }
      fetchSettings()
    }
  }, [status, canRead, router, fetchSettings])

  async function onSubmit(data: SettingsFormData) {
    setIsSaving(true)
    try {
      // Parse reminder hours from comma-separated string
      const reminderHours = data.reminderHours
        .split(",")
        .map((h) => parseInt(h.trim(), 10))
        .filter((h) => !isNaN(h) && h >= 0 && h <= 168)

      if (reminderHours.length === 0) {
        toast.error("Informe pelo menos um horário de lembrete válido")
        setIsSaving(false)
        return
      }

      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          timezone: data.timezone,
          defaultSessionDuration: data.defaultSessionDuration,
          minAdvanceBooking: data.minAdvanceBooking,
          reminderHours,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save settings")
      }

      const result = await response.json()
      setSettings(result.settings)
      reset({
        name: result.settings.name,
        timezone: result.settings.timezone,
        defaultSessionDuration: result.settings.defaultSessionDuration,
        minAdvanceBooking: result.settings.minAdvanceBooking,
        reminderHours: result.settings.reminderHours.join(", "),
      })
      toast.success("Configurações salvas com sucesso")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar configurações")
    } finally {
      setIsSaving(false)
    }
  }

  async function saveInvoiceTemplate() {
    setIsSavingTemplate(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceMessageTemplate: invoiceTemplate || null,
        }),
      })
      if (!response.ok) throw new Error("Failed to save")
      toast.success("Modelo de fatura salvo com sucesso")
    } catch {
      toast.error("Erro ao salvar modelo de fatura")
    } finally {
      setIsSavingTemplate(false)
    }
  }

  async function saveBillingMode(mode: "PER_SESSION" | "MONTHLY_FIXED") {
    setBillingMode(mode)
    setIsSavingBillingMode(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingMode: mode }),
      })
      if (!response.ok) throw new Error("Failed to save")
      const result = await response.json()
      setSettings(result.settings)
      toast.success("Modo de cobrança salvo com sucesso")
    } catch {
      toast.error("Erro ao salvar modo de cobrança")
      setBillingMode(billingMode) // revert on error
    } finally {
      setIsSavingBillingMode(false)
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-12 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Voltar
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-6">Configurações da Clínica</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6 space-y-6">
            {/* Clinic Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                Nome da Clínica *
              </label>
              <input
                id="name"
                type="text"
                {...register("name")}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.name && (
                <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Timezone */}
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-foreground mb-2">
                Fuso Horário *
              </label>
              <select
                id="timezone"
                {...register("timezone")}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              {errors.timezone && (
                <p className="text-sm text-destructive mt-1">{errors.timezone.message}</p>
              )}
            </div>

            {/* Default Session Duration */}
            <div>
              <label
                htmlFor="defaultSessionDuration"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Duração Padrão da Sessão (minutos) *
              </label>
              <input
                id="defaultSessionDuration"
                type="number"
                min={15}
                max={180}
                {...register("defaultSessionDuration", { valueAsNumber: true })}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.defaultSessionDuration && (
                <p className="text-sm text-destructive mt-1">
                  {errors.defaultSessionDuration.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Tempo padrão para novos agendamentos (15-180 minutos)
              </p>
            </div>

            {/* Min Advance Booking */}
            <div>
              <label
                htmlFor="minAdvanceBooking"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Antecedência Mínima para Agendamento (horas) *
              </label>
              <input
                id="minAdvanceBooking"
                type="number"
                min={0}
                max={168}
                {...register("minAdvanceBooking", { valueAsNumber: true })}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.minAdvanceBooking && (
                <p className="text-sm text-destructive mt-1">{errors.minAdvanceBooking.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Tempo mínimo de antecedência necessário para agendar (0-168 horas)
              </p>
            </div>

            {/* Reminder Hours */}
            <div>
              <label
                htmlFor="reminderHours"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Horários de Lembrete (horas antes) *
              </label>
              <input
                id="reminderHours"
                type="text"
                {...register("reminderHours")}
                placeholder="24, 2"
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.reminderHours && (
                <p className="text-sm text-destructive mt-1">{errors.reminderHours.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Quantas horas antes da consulta enviar lembretes, separados por vírgula (ex: 24, 2)
              </p>
            </div>
          </div>

          {/* Invoice Message Template */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Modelo de Mensagem da Fatura</h2>
            <div>
              <textarea
                rows={8}
                value={invoiceTemplate}
                onChange={(e) => setInvoiceTemplate(e.target.value)}
                placeholder={DEFAULT_INVOICE_TEMPLATE}
                className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none font-mono"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {"Variaveis disponiveis: {{paciente}}, {{mae}}, {{pai}}, {{valor}}, {{mes}}, {{ano}}, {{vencimento}}, {{sessoes}}, {{profissional}}, {{sessoes_regulares}}, {{sessoes_extras}}, {{sessoes_grupo}}, {{reunioes_escola}}, {{creditos}}, {{valor_sessao}}, {{detalhes}}"}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setInvoiceTemplate(DEFAULT_INVOICE_TEMPLATE)}
                className="h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Restaurar padrao
              </button>
              <button
                type="button"
                onClick={saveInvoiceTemplate}
                disabled={isSavingTemplate}
                className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isSavingTemplate ? "Salvando..." : "Salvar modelo"}
              </button>
            </div>
          </div>

          {/* Billing Mode */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Modo de Cobrança</h2>
            <p className="text-sm text-muted-foreground">
              Define como os valores dos pacientes são cobrados nas faturas.
            </p>
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="billingMode"
                  value="PER_SESSION"
                  checked={billingMode === "PER_SESSION"}
                  onChange={() => saveBillingMode("PER_SESSION")}
                  disabled={isSavingBillingMode}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Por sessão</span>
                  <p className="text-xs text-muted-foreground">
                    Cada sessão realizada é cobrada individualmente na fatura.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="billingMode"
                  value="MONTHLY_FIXED"
                  checked={billingMode === "MONTHLY_FIXED"}
                  onChange={() => saveBillingMode("MONTHLY_FIXED")}
                  disabled={isSavingBillingMode}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Mensalidade fixa</span>
                  <p className="text-xs text-muted-foreground">
                    Um valor fixo mensal é cobrado por paciente, independente do número de sessões.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Current Settings Summary */}
          {settings && (
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-foreground mb-2">
                Configurações Atuais
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Duração padrão: {settings.defaultSessionDuration} minutos</li>
                <li>Antecedência mínima: {settings.minAdvanceBooking} hora(s)</li>
                <li>Lembretes: {settings.reminderHours.join("h, ")}h antes</li>
              </ul>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-12 px-6 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !isDirty}
              className="h-12 px-6 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isSaving ? "Salvando..." : "Salvar Configurações"}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
