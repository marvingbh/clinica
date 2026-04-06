"use client"

import { useState, useCallback } from "react"
import { useMountEffect } from "@/shared/hooks"
import { Controller, UseFormRegister, Control, FieldErrors } from "react-hook-form"
import { DatePickerInput } from "@/shared/components/ui"
import { Professional, AdditionalPhone, UsualPayer } from "./types"
import { getFeeLabel } from "@/lib/financeiro/billing-labels"

export interface PatientFormData {
  name: string
  phone: string
  email?: string | undefined
  birthDate?: string | undefined
  cpf?: string | undefined
  billingCpf?: string | undefined
  billingResponsibleName?: string | undefined
  nfseDescriptionTemplate?: string | undefined
  addressStreet?: string | undefined
  addressNumber?: string | undefined
  addressNeighborhood?: string | undefined
  addressCity?: string | undefined
  addressState?: string | undefined
  addressZip?: string | undefined
  fatherName?: string | undefined
  motherName?: string | undefined
  schoolName?: string | undefined
  firstAppointmentDate?: string | undefined
  sessionFee?: string | undefined
  lastFeeAdjustmentDate?: string | undefined
  invoiceDueDay?: string | undefined
  invoiceGrouping?: string | undefined
  splitInvoiceByProfessional: boolean
  nfsePerAppointment: boolean
  nfseObs?: string | undefined
  therapeuticProject?: string | undefined
  notes?: string | undefined
  referenceProfessionalId?: string | undefined
  consentWhatsApp: boolean
  consentEmail: boolean
}

interface PatientFormProps {
  register: UseFormRegister<PatientFormData>
  errors: FieldErrors<PatientFormData>
  control: Control<PatientFormData>
  professionals: Professional[]
  isLoadingProfessionals: boolean
  additionalPhones: AdditionalPhone[]
  isSaving: boolean
  isEditing: boolean
  onAddPhone: () => void
  onUpdatePhone: (index: number, field: "phone" | "label" | "notify", value: string | boolean) => void
  onRemovePhone: (index: number) => void
  onClose: () => void
  onSubmit: () => void
  billingMode?: string
  usualPayers?: UsualPayer[]
  onRemoveUsualPayer?: (id: string) => void
}

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
const inputSmClass =
  "w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"

type Tab = "cadastro" | "financeiro" | "nfse"

const TABS: { id: Tab; label: string }[] = [
  { id: "cadastro", label: "Cadastro" },
  { id: "financeiro", label: "Financeiro" },
  { id: "nfse", label: "NFS-e" },
]

export function PatientForm({
  register,
  errors,
  control,
  professionals,
  isLoadingProfessionals,
  additionalPhones,
  isSaving,
  isEditing,
  onAddPhone,
  onUpdatePhone,
  onRemovePhone,
  onClose,
  onSubmit,
  billingMode = "PER_SESSION",
  usualPayers = [],
  onRemoveUsualPayer,
}: PatientFormProps) {
  const [activeTab, setActiveTab] = useState<Tab>("cadastro")

  // ESC to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }, [onClose])

  useMountEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  })

  return (
    <>
      <h2 className="text-xl font-semibold text-foreground mb-4">
        {isEditing ? "Editar Paciente" : "Novo Paciente"}
      </h2>

      {/* Tabs */}
      <div className="flex border-b border-border mb-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit}>
        <div className="min-h-[680px] space-y-5">
        {/* ═══════════════════════════════════════════ */}
        {/* TAB: Cadastro                              */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === "cadastro" && (
          <>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">Nome *</label>
              <input id="name" type="text" {...register("name")} className={inputClass} />
              {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">Email</label>
                <input id="email" type="email" {...register("email")} className={inputClass} />
                {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <label htmlFor="birthDate" className="block text-sm font-medium text-foreground mb-2">Data de Nascimento</label>
                <Controller name="birthDate" control={control} render={({ field }) => (
                  <DatePickerInput id="birthDate" value={field.value || ""} onChange={field.onChange} />
                )} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">Telefone (WhatsApp) *</label>
                <input id="phone" type="tel" {...register("phone")} placeholder="11999999999" className={inputClass} />
                {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>}
              </div>
              <div>
                <label htmlFor="cpf" className="block text-sm font-medium text-foreground mb-2">CPF do Paciente</label>
                <input id="cpf" type="text" {...register("cpf")} placeholder="000.000.000-00" className={inputClass} />
                {errors.cpf && <p className="text-sm text-destructive mt-1">{errors.cpf.message}</p>}
              </div>
            </div>

            <AdditionalPhonesSection phones={additionalPhones} onAdd={onAddPhone} onUpdate={onUpdatePhone} onRemove={onRemovePhone} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fatherName" className="block text-sm font-medium text-foreground mb-2">Nome do Pai</label>
                <input id="fatherName" type="text" {...register("fatherName")} className={inputClass} />
              </div>
              <div>
                <label htmlFor="motherName" className="block text-sm font-medium text-foreground mb-2">Nome da Mãe</label>
                <input id="motherName" type="text" {...register("motherName")} className={inputClass} />
              </div>
            </div>

            <div>
              <label htmlFor="schoolName" className="block text-sm font-medium text-foreground mb-2">Nome da Escola</label>
              <input id="schoolName" type="text" {...register("schoolName")} className={inputClass} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="referenceProfessionalId" className="block text-sm font-medium text-foreground mb-2">Profissional de Referência</label>
                <select id="referenceProfessionalId" {...register("referenceProfessionalId")} disabled={isLoadingProfessionals} className={`${inputClass} disabled:opacity-50`}>
                  <option value="">Nenhum selecionado</option>
                  {professionals.filter((p) => p.professionalProfile).map((p) => (
                    <option key={p.professionalProfile!.id} value={p.professionalProfile!.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="firstAppointmentDate" className="block text-sm font-medium text-foreground mb-2">Data Primeiro Atendimento</label>
                <Controller name="firstAppointmentDate" control={control} render={({ field }) => (
                  <DatePickerInput id="firstAppointmentDate" value={field.value || ""} onChange={field.onChange} />
                )} />
              </div>
            </div>

            <div>
              <label htmlFor="therapeuticProject" className="block text-sm font-medium text-foreground mb-2">Projeto Terapêutico</label>
              <textarea id="therapeuticProject" rows={3} {...register("therapeuticProject")} placeholder="Descreva o projeto terapêutico do paciente..." className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none" />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-2">Observações</label>
              <textarea id="notes" rows={2} {...register("notes")} placeholder="Observações internas sobre o paciente..." className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none" />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consentimentos LGPD</p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" {...register("consentWhatsApp")} className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring" />
                <div>
                  <span className="text-sm text-foreground">Autorizo receber mensagens via WhatsApp</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Lembretes de consulta, confirmações e comunicações da clínica</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" {...register("consentEmail")} className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring" />
                <div>
                  <span className="text-sm text-foreground">Autorizo receber comunicações por email</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Lembretes de consulta, confirmações e comunicações da clínica</p>
                </div>
              </label>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* TAB: Financeiro                            */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === "financeiro" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sessionFee" className="block text-sm font-medium text-foreground mb-2">{getFeeLabel(billingMode)} (R$)</label>
                <input id="sessionFee" type="text" inputMode="decimal" {...register("sessionFee")} placeholder="150.00" className={inputClass} />
              </div>
              <div>
                <label htmlFor="lastFeeAdjustmentDate" className="block text-sm font-medium text-foreground mb-2">Data Último Reajuste</label>
                <Controller name="lastFeeAdjustmentDate" control={control} render={({ field }) => (
                  <DatePickerInput id="lastFeeAdjustmentDate" value={field.value || ""} onChange={field.onChange} />
                )} />
                <p className="text-xs text-muted-foreground mt-1">Atualizado automaticamente ao alterar o valor da sessão</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="invoiceDueDay" className="block text-sm font-medium text-foreground mb-2">Dia de Vencimento da Fatura</label>
                <input id="invoiceDueDay" type="number" min={1} max={28} {...register("invoiceDueDay")} placeholder="Padrão da clínica" className={inputClass} />
                <p className="text-xs text-muted-foreground mt-1">Opcional. Se vazio, usa o padrão da clínica.</p>
              </div>
              <div>
                <label htmlFor="invoiceGrouping" className="block text-sm font-medium text-foreground mb-2">Agrupamento de Faturas</label>
                <select id="invoiceGrouping" {...register("invoiceGrouping")} className={inputClass}>
                  <option value="">Padrão da clínica</option>
                  <option value="MONTHLY">Mensal</option>
                  <option value="PER_SESSION" disabled={billingMode === "MONTHLY_FIXED"}>Por Sessão</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" {...register("splitInvoiceByProfessional")} className="w-4 h-4 rounded border-input text-primary focus:ring-primary" />
              <div>
                <span className="text-sm font-medium text-foreground">Faturar separado por profissional</span>
                <p className="text-xs text-muted-foreground">Gera uma fatura por profissional quando há sessões com múltiplos profissionais</p>
              </div>
            </label>

            {isEditing && usualPayers.length > 0 && (
              <div className="border border-border rounded-lg p-4">
                <label className="text-sm font-medium text-foreground">Pagadores usuais</label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Nomes aprendidos automaticamente pela conciliação bancária. Remova caso estejam incorretos.</p>
                <div className="flex flex-wrap gap-2">
                  {usualPayers.map((payer) => (
                    <span key={payer.id} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800">
                      {payer.payerName}
                      {onRemoveUsualPayer && (
                        <button type="button" onClick={() => onRemoveUsualPayer(payer.id)} className="ml-0.5 text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors" title="Remover pagador usual">&times;</button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* TAB: NFS-e                                 */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === "nfse" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="billingCpf" className="block text-sm font-medium text-foreground mb-2">CPF para Nota Fiscal</label>
                <input id="billingCpf" type="text" {...register("billingCpf")} placeholder="000.000.000-00" className={inputClass} />
                <p className="text-xs text-muted-foreground mt-1">CPF do responsável financeiro. Se vazio, usa o CPF do paciente.</p>
              </div>
              <div>
                <label htmlFor="billingResponsibleName" className="block text-sm font-medium text-foreground mb-2">Nome do Responsável Financeiro</label>
                <input id="billingResponsibleName" type="text" {...register("billingResponsibleName")} placeholder="Nome completo (pai/mãe)" className={inputClass} />
                <p className="text-xs text-muted-foreground mt-1">Se vazio, usa o nome do paciente.</p>
              </div>
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Endereço do Tomador</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="addressStreet" className="block text-sm font-medium text-foreground mb-2">Rua</label>
                <input id="addressStreet" type="text" {...register("addressStreet")} className={inputClass} />
              </div>
              <div>
                <label htmlFor="addressNumber" className="block text-sm font-medium text-foreground mb-2">Número</label>
                <input id="addressNumber" type="text" {...register("addressNumber")} placeholder="SN" className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="addressNeighborhood" className="block text-sm font-medium text-foreground mb-2">Bairro</label>
                <input id="addressNeighborhood" type="text" {...register("addressNeighborhood")} className={inputClass} />
              </div>
              <div>
                <label htmlFor="addressCity" className="block text-sm font-medium text-foreground mb-2">Cidade</label>
                <input id="addressCity" type="text" {...register("addressCity")} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="addressState" className="block text-sm font-medium text-foreground mb-2">UF</label>
                  <input id="addressState" type="text" maxLength={2} {...register("addressState")} placeholder="MG" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="addressZip" className="block text-sm font-medium text-foreground mb-2">CEP</label>
                  <input id="addressZip" type="text" {...register("addressZip")} placeholder="00000000" className={inputClass} />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="nfseDescriptionTemplate" className="block text-sm font-medium text-foreground mb-2">Descrição NFS-e (personalizada)</label>
              <textarea id="nfseDescriptionTemplate" rows={5} {...register("nfseDescriptionTemplate")} placeholder="Deixe vazio para usar o padrão da clínica. Variáveis: {{paciente}}, {{relacao}}, {{profissional}}, {{dias}}, {{mes}}, {{ano}}, {{valor_sessao}}, {{impostos}}" className={`${inputClass} resize-y`} />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" {...register("nfsePerAppointment")} className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring" />
              <div>
                <span className="text-sm text-foreground">Emitir NFS-e individual por sessão</span>
                <p className="text-xs text-muted-foreground mt-0.5">Gera uma NFS-e separada para cada sessão ao invés de uma NFS-e por fatura</p>
              </div>
            </label>

            <div>
              <label htmlFor="nfseObs" className="block text-sm font-medium text-foreground mb-2">Observação NFS-e</label>
              <input id="nfseObs" type="text" {...register("nfseObs")} placeholder="Aviso exibido ao emitir NFS-e (ex: CPF diferente, isenção, etc.)" className={inputClass} />
              <p className="text-xs text-muted-foreground mt-1">Se preenchido, aparece em destaque no popup de emissão.</p>
            </div>
          </>
        )}

        </div>
        {/* ─── Actions (always visible) ─── */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSaving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar paciente"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  )
}

function AdditionalPhonesSection({
  phones,
  onAdd,
  onUpdate,
  onRemove,
}: {
  phones: AdditionalPhone[]
  onAdd: () => void
  onUpdate: (index: number, field: "phone" | "label" | "notify", value: string | boolean) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-foreground">Telefones adicionais</label>
        <button type="button" onClick={onAdd} disabled={phones.length >= 4} className="text-sm text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors">
          + Adicionar telefone
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Contatos adicionais (mãe, pai, responsável, etc.). Clique no sino para ativar/desativar notificações.</p>
      {phones.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nenhum telefone adicional</p>
      ) : (
        <div className="space-y-3">
          {phones.map((phone, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <input type="text" placeholder="Rótulo (ex: Mãe, Trabalho)" value={phone.label} onChange={(e) => onUpdate(index, "label", e.target.value)} maxLength={30} className={inputSmClass} />
              </div>
              <div className="flex-1 min-w-0">
                <input type="tel" placeholder="11999999999" value={phone.phone} onChange={(e) => onUpdate(index, "phone", e.target.value)} className={inputSmClass} />
              </div>
              <button type="button" onClick={() => onUpdate(index, "notify", !phone.notify)} className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-md transition-colors ${phone.notify !== false ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted"}`} title={phone.notify !== false ? "Recebe notificações" : "Não recebe notificações"}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {phone.notify !== false ? (
                    <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>
                  ) : (
                    <><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" /><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  )}
                </svg>
              </button>
              <button type="button" onClick={() => onRemove(index)} className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remover telefone">&times;</button>
            </div>
          ))}
        </div>
      )}
      {phones.length >= 4 && <p className="text-xs text-muted-foreground mt-2">Máximo de 4 telefones adicionais atingido</p>}
    </div>
  )
}
