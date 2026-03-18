"use client"

import { useCallback, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { nfseConfigSchema, type NfseConfigFormData } from "@/lib/nfse"
import NfseConfigSummary, { type NfseConfigSummaryData } from "./NfseConfigSummary"
import NfseConfigFields from "./NfseConfigFields"

export default function NfseConfigForm() {
  const [config, setConfig] = useState<NfseConfigSummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPassword, setCertPassword] = useState("")

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<NfseConfigFormData>({
    resolver: zodResolver(nfseConfigSchema),
    defaultValues: { useSandbox: true, aliquotaIss: 0, regimeTributario: "2", opSimpNac: 2 },
  })

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings/nfse")
      if (res.status === 404) {
        setConfig(null)
        return
      }
      if (!res.ok) throw new Error("Erro ao carregar")
      const data = await res.json()
      setConfig(data.config)
    } catch {
      // No config yet -- that's fine
    } finally {
      setIsLoading(false)
    }
  }, [])

  useMountEffect(() => {
    fetchConfig()
  })

  function startEditing() {
    if (config) {
      reset({
        cnpj: config.cnpj,
        inscricaoMunicipal: config.inscricaoMunicipal,
        codigoMunicipio: config.codigoMunicipio,
        regimeTributario: config.regimeTributario,
        opSimpNac: config.opSimpNac ?? 2,
        codigoServico: config.codigoServico,
        codigoServicoMunicipal: config.codigoServicoMunicipal ?? "",
        nfseTaxPercentage: config.nfseTaxPercentage ?? undefined,
        professionalCrp: config.professionalCrp ?? "",
        cnae: config.cnae ?? undefined,
        codigoNbs: config.codigoNbs ?? undefined,
        aliquotaIss: config.aliquotaIss,
        descricaoServico: config.descricaoServico ?? undefined,
        useSandbox: config.useSandbox,
      })
    } else {
      reset({ useSandbox: true, aliquotaIss: 0, regimeTributario: "2", opSimpNac: 2 })
    }
    setCertFile(null)
    setCertPassword("")
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setCertFile(null)
    setCertPassword("")
  }

  async function onSubmit(data: NfseConfigFormData) {
    if (!config && !certFile) {
      toast.error("Certificado digital A1 obrigatorio na primeira configuracao")
      return
    }

    setIsSaving(true)
    try {
      const formData = new FormData()
      // Clean NaN values from number fields before serializing
      const cleanData = { ...data, nfseTaxPercentage: Number.isNaN(data.nfseTaxPercentage) ? null : data.nfseTaxPercentage }
      formData.append("config", JSON.stringify(cleanData))
      if (certFile) {
        formData.append("certificate", certFile)
        formData.append("certificatePassword", certPassword)
      }

      const res = await fetch("/api/admin/settings/nfse", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        let errMsg = "Erro ao salvar"
        try { const err = await res.json(); errMsg = err.error || errMsg } catch { /* non-JSON error */ }
        throw new Error(errMsg)
      }

      const result = await res.json()
      setConfig(result.config)
      setIsEditing(false)
      setCertFile(null)
      setCertPassword("")
      toast.success("Configuracao NFS-e salva com sucesso")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar configuracao NFS-e")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja remover a configuracao NFS-e? Essa acao nao pode ser desfeita.")) return

    setIsDeleting(true)
    try {
      const res = await fetch("/api/admin/settings/nfse", { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao remover")
      setConfig(null)
      setIsEditing(false)
      toast.success("Configuracao NFS-e removida")
    } catch {
      toast.error("Erro ao remover configuracao NFS-e")
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-56 bg-muted rounded" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
      </div>
    )
  }

  // --- Collapsed view: show summary or setup prompt ---
  if (!isEditing) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">NFS-e (Nota Fiscal de Servico)</h2>

        {config ? (
          <NfseConfigSummary
            config={config}
            onEdit={startEditing}
            onDelete={handleDelete}
            isDeleting={isDeleting}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Configure a emissao automatica de NFS-e via sistema nacional (gov.br).
            </p>
            <button
              type="button"
              onClick={startEditing}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Configurar NFS-e
            </button>
          </>
        )}
      </div>
    )
  }

  // --- Expanded form ---
  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold text-foreground">NFS-e (Nota Fiscal de Servico)</h2>

      <div className="space-y-5">
        <NfseConfigFields
          register={register}
          errors={errors}
          hasCertificate={config?.hasCertificate ?? false}
          certFile={certFile}
          onCertFileChange={setCertFile}
          certPassword={certPassword}
          onCertPasswordChange={setCertPassword}
          isNewConfig={!config}
          onNbsChange={(nbs, cc) => { setValue("codigoNbs", nbs); setValue("cClassNbs", cc) }}
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSaving ? "Salvando..." : "Salvar Configuracao"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            className="h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
