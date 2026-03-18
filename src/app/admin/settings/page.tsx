"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useRequireAuth } from "@/shared/hooks"
import { DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import NfseConfigForm from "./components/NfseConfigForm"

// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
]

const settingsSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  phone: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").max(200).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
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
  invoiceDueDay: z
    .number()
    .int()
    .min(1, "Mínimo dia 1")
    .max(28, "Máximo dia 28"),
})

type SettingsFormData = z.infer<typeof settingsSchema>

interface ClinicSettings {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  timezone: string
  defaultSessionDuration: number
  minAdvanceBooking: number
  reminderHours: number[]
  invoiceDueDay: number
  invoiceMessageTemplate: string | null
  paymentInfo: string | null
  emailSenderName: string | null
  emailFromAddress: string | null
  emailBcc: string | null
  billingMode: "PER_SESSION" | "MONTHLY_FIXED"
  invoiceGrouping: "MONTHLY" | "PER_SESSION"
  taxPercentage: number
  hasLogo: boolean
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const { isReady, status } = useRequireAuth({ feature: "clinic_settings", minAccess: "READ" })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<ClinicSettings | null>(null)
  const [invoiceTemplate, setInvoiceTemplate] = useState<string>("")
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [paymentInfo, setPaymentInfo] = useState<string>("")
  const [isSavingPaymentInfo, setIsSavingPaymentInfo] = useState(false)
  const [emailSenderName, setEmailSenderName] = useState<string>("")
  const [emailFromAddress, setEmailFromAddress] = useState<string>("")
  const [emailBcc, setEmailBcc] = useState<string>("")
  const [isSavingEmailSender, setIsSavingEmailSender] = useState(false)
  const [billingMode, setBillingMode] = useState<"PER_SESSION" | "MONTHLY_FIXED">("PER_SESSION")
  const [isSavingBillingMode, setIsSavingBillingMode] = useState(false)
  const [invoiceGrouping, setInvoiceGrouping] = useState<"MONTHLY" | "PER_SESSION">("MONTHLY")
  const [isSavingInvoiceGrouping, setIsSavingInvoiceGrouping] = useState(false)
  const [taxPercentage, setTaxPercentage] = useState<number>(0)
  const [isSavingTax, setIsSavingTax] = useState(false)
  const [hasLogo, setHasLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isSavingLogo, setIsSavingLogo] = useState(false)

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
      setPaymentInfo(data.settings.paymentInfo || "")
      setEmailSenderName(data.settings.emailSenderName || "")
      setEmailFromAddress(data.settings.emailFromAddress || "")
      setEmailBcc(data.settings.emailBcc || "")
      setBillingMode(data.settings.billingMode || "PER_SESSION")
      setInvoiceGrouping(data.settings.invoiceGrouping || "MONTHLY")
      setTaxPercentage(Number(data.settings.taxPercentage ?? 0))
      setHasLogo(data.settings.hasLogo ?? false)
      if (data.settings.hasLogo) {
        setLogoPreview("/api/admin/settings/logo")
      }
      reset({
        name: data.settings.name,
        phone: data.settings.phone || "",
        email: data.settings.email || "",
        address: data.settings.address || "",
        timezone: data.settings.timezone,
        defaultSessionDuration: data.settings.defaultSessionDuration,
        minAdvanceBooking: data.settings.minAdvanceBooking,
        reminderHours: data.settings.reminderHours.join(", "),
        invoiceDueDay: data.settings.invoiceDueDay ?? 15,
      })
    } catch {
      toast.error("Erro ao carregar configurações")
    } finally {
      setIsLoading(false)
    }
  }, [router, reset])

  // Data fetch: depends on auth readiness — must remain an effect
   
  useEffect(() => {
    if (isReady) {
      fetchSettings()
    }
  }, [isReady, fetchSettings])

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
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          timezone: data.timezone,
          defaultSessionDuration: data.defaultSessionDuration,
          minAdvanceBooking: data.minAdvanceBooking,
          reminderHours,
          invoiceDueDay: data.invoiceDueDay,
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
        phone: result.settings.phone || "",
        email: result.settings.email || "",
        address: result.settings.address || "",
        timezone: result.settings.timezone,
        defaultSessionDuration: result.settings.defaultSessionDuration,
        minAdvanceBooking: result.settings.minAdvanceBooking,
        reminderHours: result.settings.reminderHours.join(", "),
        invoiceDueDay: result.settings.invoiceDueDay ?? 15,
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

  async function savePaymentInfo() {
    setIsSavingPaymentInfo(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentInfo: paymentInfo || null,
        }),
      })
      if (!response.ok) throw new Error("Failed to save")
      toast.success("Dados de pagamento salvos com sucesso")
    } catch {
      toast.error("Erro ao salvar dados de pagamento")
    } finally {
      setIsSavingPaymentInfo(false)
    }
  }

  async function saveEmailSenderName() {
    setIsSavingEmailSender(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailSenderName: emailSenderName || null,
          emailFromAddress: emailFromAddress || null,
          emailBcc: emailBcc || null,
        }),
      })
      if (!response.ok) throw new Error("Failed to save")
      toast.success("Nome do remetente salvo")
    } catch {
      toast.error("Erro ao salvar nome do remetente")
    } finally {
      setIsSavingEmailSender(false)
    }
  }

  async function saveBillingMode(mode: "PER_SESSION" | "MONTHLY_FIXED") {
    const prevBillingMode = billingMode
    const prevInvoiceGrouping = invoiceGrouping
    setBillingMode(mode)
    if (mode === "MONTHLY_FIXED") {
      setInvoiceGrouping("MONTHLY")
    }
    setIsSavingBillingMode(true)
    try {
      const payload: Record<string, unknown> = { billingMode: mode }
      if (mode === "MONTHLY_FIXED") {
        payload.invoiceGrouping = "MONTHLY"
      }
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error("Failed to save")
      const result = await response.json()
      setSettings(result.settings)
      setInvoiceGrouping(result.settings.invoiceGrouping || "MONTHLY")
      toast.success("Modo de cobrança salvo com sucesso")
    } catch {
      toast.error("Erro ao salvar modo de cobrança")
      setBillingMode(prevBillingMode)
      setInvoiceGrouping(prevInvoiceGrouping)
    } finally {
      setIsSavingBillingMode(false)
    }
  }

  async function saveInvoiceGrouping(grouping: "MONTHLY" | "PER_SESSION") {
    const prevGrouping = invoiceGrouping
    setInvoiceGrouping(grouping)
    setIsSavingInvoiceGrouping(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceGrouping: grouping }),
      })
      if (!response.ok) throw new Error("Failed to save")
      const result = await response.json()
      setSettings(result.settings)
      toast.success("Agrupamento de faturas salvo com sucesso")
    } catch {
      toast.error("Erro ao salvar agrupamento de faturas")
      setInvoiceGrouping(prevGrouping)
    } finally {
      setIsSavingInvoiceGrouping(false)
    }
  }

  async function saveTaxPercentage() {
    setIsSavingTax(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxPercentage }),
      })
      if (!response.ok) throw new Error("Failed to save")
      const result = await response.json()
      setSettings(result.settings)
      toast.success("Percentual de imposto salvo com sucesso")
    } catch {
      toast.error("Erro ao salvar percentual de imposto")
    } finally {
      setIsSavingTax(false)
    }
  }

  async function uploadLogo(file: File) {
    setIsSavingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/admin/settings/logo", {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to upload")
      }
      setHasLogo(true)
      setLogoPreview(URL.createObjectURL(file))
      toast.success("Logo salvo com sucesso")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar logo")
    } finally {
      setIsSavingLogo(false)
    }
  }

  async function removeLogo() {
    setIsSavingLogo(true)
    try {
      const response = await fetch("/api/admin/settings/logo", { method: "DELETE" })
      if (!response.ok) throw new Error("Failed to delete")
      setHasLogo(false)
      setLogoPreview(null)
      toast.success("Logo removido com sucesso")
    } catch {
      toast.error("Erro ao remover logo")
    } finally {
      setIsSavingLogo(false)
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

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">
                Telefone
              </label>
              <input
                id="phone"
                type="text"
                {...register("phone")}
                placeholder="(11) 99999-9999"
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.phone && (
                <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register("email")}
                placeholder="contato@clinica.com"
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Address */}
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-foreground mb-2">
                Endereço
              </label>
              <input
                id="address"
                type="text"
                {...register("address")}
                placeholder="Rua Example, 123 - São Paulo, SP"
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.address && (
                <p className="text-sm text-destructive mt-1">{errors.address.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Telefone, email e endereço aparecem no cabeçalho do PDF da fatura.
              </p>
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

            {/* Invoice Due Day */}
            <div>
              <label
                htmlFor="invoiceDueDay"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Dia de Vencimento da Fatura *
              </label>
              <input
                id="invoiceDueDay"
                type="number"
                min={1}
                max={28}
                {...register("invoiceDueDay", { valueAsNumber: true })}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              {errors.invoiceDueDay && (
                <p className="text-sm text-destructive mt-1">{errors.invoiceDueDay.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Dia do mês para vencimento das faturas geradas (1-28)
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

          {/* Payment Info */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Dados para Pagamento</h2>
            <p className="text-sm text-muted-foreground">
              Informacoes de pagamento exibidas no PDF da fatura (PIX, dados bancarios, etc).
            </p>
            <div>
              <textarea
                rows={4}
                value={paymentInfo}
                onChange={(e) => setPaymentInfo(e.target.value)}
                placeholder={"PIX: 12.345.678/0001-00 (CNPJ)\nBanco: Itaú\nAgência: 1234 / Conta: 56789-0"}
                className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={savePaymentInfo}
                disabled={isSavingPaymentInfo}
                className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isSavingPaymentInfo ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>

          {/* Email Sender */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Configurações de E-mail</h2>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nome do remetente</label>
              <p className="text-xs text-muted-foreground mb-2">
                Nome que aparece como remetente nos emails enviados. Se vazio, usa o nome da clínica.
              </p>
              <input
                type="text"
                value={emailSenderName}
                onChange={(e) => setEmailSenderName(e.target.value)}
                placeholder={settings?.name || "Nome da clinica"}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Endereço de envio</label>
              <p className="text-xs text-muted-foreground mb-2">
                E-mail verificado usado como remetente (ex: naoresponda@seudominio.com.br). O domínio deve estar verificado no Resend.
              </p>
              <input
                type="email"
                value={emailFromAddress}
                onChange={(e) => setEmailFromAddress(e.target.value)}
                placeholder="naoresponda@seudominio.com.br"
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">E-mail em cópia oculta (BCC)</label>
              <p className="text-xs text-muted-foreground mb-2">
                Todos os e-mails enviados também serão copiados para este endereço.
              </p>
              <input
                type="email"
                value={emailBcc}
                onChange={(e) => setEmailBcc(e.target.value)}
                placeholder="arquivo@seudominio.com.br"
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveEmailSenderName}
                disabled={isSavingEmailSender}
                className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isSavingEmailSender ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>

          {/* Invoice Logo */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Logo da Fatura</h2>
            <p className="text-sm text-muted-foreground">
              Imagem exibida no cabeçalho do PDF da fatura. PNG ou JPG, máximo 512KB.
            </p>
            {logoPreview && (
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="Logo atual" className="h-12 w-auto max-w-[200px] object-contain" />
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={isSavingLogo}
                  className="text-sm text-destructive hover:underline disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            )}
            <div>
              <label className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 cursor-pointer transition-opacity">
                {isSavingLogo ? "Enviando..." : hasLogo ? "Trocar logo" : "Enviar logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  disabled={isSavingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadLogo(file)
                    e.target.value = ""
                  }}
                />
              </label>
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

          {/* Invoice Grouping */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Agrupamento de Faturas</h2>
            <p className="text-sm text-muted-foreground">
              Define como as faturas são agrupadas ao serem geradas.
            </p>
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="invoiceGrouping"
                  value="MONTHLY"
                  checked={invoiceGrouping === "MONTHLY"}
                  onChange={() => saveInvoiceGrouping("MONTHLY")}
                  disabled={isSavingInvoiceGrouping}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Mensal (uma fatura por mês)</span>
                  <p className="text-xs text-muted-foreground">
                    Todas as sessões do mês são agrupadas em uma única fatura.
                  </p>
                </div>
              </label>
              <label className={`flex items-start gap-3 ${billingMode === "MONTHLY_FIXED" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="radio"
                  name="invoiceGrouping"
                  value="PER_SESSION"
                  checked={invoiceGrouping === "PER_SESSION"}
                  onChange={() => saveInvoiceGrouping("PER_SESSION")}
                  disabled={isSavingInvoiceGrouping || billingMode === "MONTHLY_FIXED"}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Por Sessão (uma fatura por sessão)</span>
                  <p className="text-xs text-muted-foreground">
                    Cada sessão realizada gera uma fatura individual.
                  </p>
                </div>
              </label>
            </div>
            {billingMode === "MONTHLY_FIXED" && (
              <p className="text-xs text-muted-foreground">
                Agrupamento por sessão requer modo de cobrança por sessão.
              </p>
            )}
          </div>

          {/* Tax Percentage for Repasse */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Imposto para Repasse</h2>
            <p className="text-sm text-muted-foreground">
              Percentual de imposto descontado do valor bruto antes de calcular o repasse dos profissionais.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label htmlFor="taxPercentage" className="block text-sm font-medium text-foreground mb-2">
                  Percentual (%)
                </label>
                <input
                  id="taxPercentage"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={saveTaxPercentage}
                disabled={isSavingTax}
                className="h-12 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isSavingTax ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>

          {/* NFS-e Configuration */}
          <NfseConfigForm />

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
