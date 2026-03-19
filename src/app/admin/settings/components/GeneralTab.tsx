import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import type { TabProps } from "../types"
import { patchSettings } from "../types"

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
]

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  slug: z.string().min(2, "Slug deve ter pelo menos 2 caracteres").max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Apenas letras minúsculas, números e hífens"),
  phone: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("Email inválido").max(200).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  timezone: z.string().min(1, "Timezone é obrigatório"),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
const labelClass = "block text-sm font-medium text-foreground mb-2"

export default function GeneralTab({ settings, onUpdate }: TabProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [hasLogo, setHasLogo] = useState(settings.hasLogo)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    settings.hasLogo ? "/api/admin/settings/logo" : null
  )
  const [isSavingLogo, setIsSavingLogo] = useState(false)

  const [copied, setCopied] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: settings.name,
      slug: settings.slug,
      phone: settings.phone || "",
      email: settings.email || "",
      address: settings.address || "",
      timezone: settings.timezone,
    },
  })

  async function onSubmit(data: FormValues) {
    setIsSaving(true)
    try {
      const updated = await patchSettings({
        name: data.name,
        slug: data.slug,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        timezone: data.timezone,
      })
      onUpdate(updated)
      reset(data)
      toast.success("Configurações salvas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setIsSaving(false)
    }
  }

  async function uploadLogo(file: File) {
    setIsSavingLogo(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/settings/logo", { method: "POST", body: fd })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao enviar")
      }
      setHasLogo(true)
      setLogoPreview(URL.createObjectURL(file))
      toast.success("Logo salvo")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar logo")
    } finally {
      setIsSavingLogo(false)
    }
  }

  async function removeLogo() {
    setIsSavingLogo(true)
    try {
      const res = await fetch("/api/admin/settings/logo", { method: "DELETE" })
      if (!res.ok) throw new Error()
      setHasLogo(false)
      setLogoPreview(null)
      toast.success("Logo removido")
    } catch {
      toast.error("Erro ao remover logo")
    } finally {
      setIsSavingLogo(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div>
          <label className={labelClass}>Nome da Clínica *</label>
          <input {...register("name")} className={inputClass} />
          {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Slug (identificador na URL) *</label>
          <input {...register("slug")} className={inputClass} placeholder="minha-clinica" />
          {errors.slug && <p className="text-sm text-destructive mt-1">{errors.slug.message}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Usado na URL da ficha de cadastro. Apenas letras minúsculas, números e hífens.
          </p>
        </div>
        <IntakeFormLink control={control} copied={copied} onCopy={() => setCopied(true)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Telefone</label>
            <input {...register("phone")} placeholder="(11) 99999-9999" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" {...register("email")} placeholder="contato@clinica.com" className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Endereço</label>
          <input {...register("address")} placeholder="Rua Example, 123 - São Paulo, SP" className={inputClass} />
          <p className="text-xs text-muted-foreground mt-1">
            Telefone, email e endereço aparecem no cabeçalho do PDF da fatura.
          </p>
        </div>
        <div>
          <label className={labelClass}>Fuso Horário *</label>
          <select {...register("timezone")} className={inputClass}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving || !isDirty}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Logo da Fatura</h2>
        <p className="text-xs text-muted-foreground">PNG ou JPG, máximo 512KB. Exibida no cabeçalho do PDF.</p>
        {logoPreview && (
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoPreview} alt="Logo" className="h-12 w-auto max-w-[200px] object-contain" />
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
        <label className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 cursor-pointer transition-opacity">
          {isSavingLogo ? "Enviando..." : hasLogo ? "Trocar logo" : "Enviar logo"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            disabled={isSavingLogo}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadLogo(f)
              e.target.value = ""
            }}
          />
        </label>
      </div>
    </div>
  )
}

function IntakeFormLink({
  control,
  copied,
  onCopy,
}: {
  control: ReturnType<typeof useForm<FormValues>>["control"]
  copied: boolean
  onCopy: () => void
}) {
  const slug = useWatch({ control, name: "slug" })
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const url = slug ? `${origin}/intake/${slug}` : ""

  if (!url) return null

  return (
    <div className="p-3 rounded-md bg-muted/50 border border-border space-y-2">
      <p className="text-sm font-medium text-foreground">Link da Ficha de Cadastro</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs text-muted-foreground bg-background px-3 py-2 rounded border border-input truncate">
          {url}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url)
            onCopy()
            setTimeout(() => {}, 0)
          }}
          className="shrink-0 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-muted transition-colors"
        >
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Compartilhe este link com os responsáveis para preenchimento da ficha de cadastro.
      </p>
    </div>
  )
}
