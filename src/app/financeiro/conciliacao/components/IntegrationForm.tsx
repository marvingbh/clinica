"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { SaveIcon, EyeIcon, EyeOffIcon, Loader2Icon, UploadIcon, SettingsIcon } from "lucide-react"

interface Integration {
  id: string
  clientId: string
  accountNumber: string | null
  isActive: boolean
}

interface IntegrationFormProps {
  existing: Integration | null
  onSaved: () => void
}

export function IntegrationForm({ existing, onSaved }: IntegrationFormProps) {
  const [clientId, setClientId] = useState(existing?.clientId || "")
  const [clientSecret, setClientSecret] = useState("")
  const [certificate, setCertificate] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber || "")
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isOpen, setIsOpen] = useState(!existing)

  const handleFileUpload = (setter: (v: string) => void) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".crt,.pem,.key,.cer"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => setter(reader.result as string)
      reader.readAsText(file)
    }
    input.click()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, certificate, privateKey, accountNumber: accountNumber || null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao salvar")
      }
      toast.success("Integração salva com sucesso")
      setIsOpen(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar integração")
    } finally {
      setSaving(false)
    }
  }

  // When not configured, show just the form
  if (!existing) {
    return (
      <div className="border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Configurar Banco Inter</h3>
        <IntegrationFields
          clientId={clientId} setClientId={setClientId}
          clientSecret={clientSecret} setClientSecret={setClientSecret}
          showSecret={showSecret} setShowSecret={setShowSecret}
          certificate={certificate} setCertificate={setCertificate}
          privateKey={privateKey} setPrivateKey={setPrivateKey}
          accountNumber={accountNumber} setAccountNumber={setAccountNumber}
          handleFileUpload={handleFileUpload}
          existing={existing}
          saving={saving}
          onSubmit={handleSubmit}
        />
      </div>
    )
  }

  // When configured, show a compact settings toggle
  return (
    <>
      {isOpen && (
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Configuração Banco Inter</h3>
            <button onClick={() => setIsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
              Fechar
            </button>
          </div>
          <IntegrationFields
            clientId={clientId} setClientId={setClientId}
            clientSecret={clientSecret} setClientSecret={setClientSecret}
            showSecret={showSecret} setShowSecret={setShowSecret}
            certificate={certificate} setCertificate={setCertificate}
            privateKey={privateKey} setPrivateKey={setPrivateKey}
            accountNumber={accountNumber} setAccountNumber={setAccountNumber}
            handleFileUpload={handleFileUpload}
            existing={existing}
            saving={saving}
            onSubmit={handleSubmit}
          />
        </div>
      )}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          Configuração
        </button>
      )}
    </>
  )
}

/** Extracted form fields to avoid duplication */
function IntegrationFields({
  clientId, setClientId,
  clientSecret, setClientSecret,
  showSecret, setShowSecret,
  certificate, setCertificate,
  privateKey, setPrivateKey,
  accountNumber, setAccountNumber,
  handleFileUpload,
  existing,
  saving,
  onSubmit,
}: {
  clientId: string; setClientId: (v: string) => void
  clientSecret: string; setClientSecret: (v: string) => void
  showSecret: boolean; setShowSecret: (v: boolean) => void
  certificate: string; setCertificate: (v: string) => void
  privateKey: string; setPrivateKey: (v: string) => void
  accountNumber: string; setAccountNumber: (v: string) => void
  handleFileUpload: (setter: (v: string) => void) => void
  existing: Integration | null
  saving: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Client ID</label>
        <input
          type="text"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Client Secret</label>
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder={existing ? "••••••••" : ""}
            className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-background text-sm"
            required={!existing}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
          >
            {showSecret ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Certificado (.crt / .pem)</label>
          <button
            type="button"
            onClick={() => handleFileUpload(setCertificate)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <UploadIcon className="w-3 h-3" />
            Importar arquivo
          </button>
        </div>
        <textarea
          value={certificate}
          onChange={e => setCertificate(e.target.value)}
          placeholder={existing ? "Cole ou importe o certificado" : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
          rows={4}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm font-mono"
          required={!existing}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Chave Privada (.key)</label>
          <button
            type="button"
            onClick={() => handleFileUpload(setPrivateKey)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <UploadIcon className="w-3 h-3" />
            Importar arquivo
          </button>
        </div>
        <textarea
          value={privateKey}
          onChange={e => setPrivateKey(e.target.value)}
          placeholder={existing ? "Cole ou importe a chave privada" : "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
          rows={4}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm font-mono"
          required={!existing}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Número da Conta (opcional)</label>
        <input
          type="text"
          value={accountNumber}
          onChange={e => setAccountNumber(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
        />
      </div>
      <Button type="submit" disabled={saving} size="sm">
        {saving ? <Loader2Icon className="w-4 h-4 animate-spin mr-1" /> : <SaveIcon className="w-4 h-4 mr-1" />}
        {existing ? "Atualizar" : "Salvar"}
      </Button>
    </form>
  )
}
