import { useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import type { TabProps } from "../types"
import { patchSettings } from "../types"

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
const labelClass = "block text-sm font-medium text-foreground mb-1"

export default function EmailTab({ settings, onUpdate }: TabProps) {
  const [senderName, setSenderName] = useState(settings.emailSenderName || "")
  const [fromAddress, setFromAddress] = useState(settings.emailFromAddress || "")
  const [bcc, setBcc] = useState(settings.emailBcc || "")
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    setIsSaving(true)
    try {
      const updated = await patchSettings({
        emailSenderName: senderName || null,
        emailFromAddress: fromAddress || null,
        emailBcc: bcc || null,
      })
      onUpdate(updated)
      toast.success("Configurações de e-mail salvas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div>
          <label className={labelClass}>Nome do remetente</label>
          <p className="text-xs text-muted-foreground mb-2">
            Nome que aparece como remetente nos emails. Se vazio, usa o nome da clínica.
          </p>
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder={settings.name || "Nome da clinica"}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Endereço de envio</label>
          <p className="text-xs text-muted-foreground mb-2">
            E-mail verificado usado como remetente. O domínio deve estar verificado no Resend.
          </p>
          <input
            type="email"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder="naoresponda@seudominio.com.br"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>E-mail em cópia oculta (BCC)</label>
          <p className="text-xs text-muted-foreground mb-2">
            Todos os e-mails também serão copiados para este endereço.
          </p>
          <input
            type="email"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="arquivo@seudominio.com.br"
            className={inputClass}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Templates de Notificação</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Personalize mensagens de WhatsApp e Email enviadas aos pacientes.
            </p>
          </div>
          <Link
            href="/admin/settings/notifications"
            className="h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted inline-flex items-center transition-colors"
          >
            Gerenciar
          </Link>
        </div>
      </div>
    </div>
  )
}
