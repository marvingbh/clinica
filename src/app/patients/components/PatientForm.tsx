"use client"

import { Controller, UseFormRegister, Control, FieldErrors } from "react-hook-form"
import { DatePickerInput } from "@/shared/components/ui"
import { Professional, AdditionalPhone } from "./types"
import { getFeeLabel } from "@/lib/financeiro/billing-labels"

export interface PatientFormData {
  name: string
  phone: string
  email?: string | undefined
  birthDate?: string | undefined
  fatherName?: string | undefined
  motherName?: string | undefined
  schoolName?: string | undefined
  firstAppointmentDate?: string | undefined
  sessionFee?: string | undefined
  lastFeeAdjustmentDate?: string | undefined
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
}

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
}: PatientFormProps) {
  return (
    <>
      <h2 className="text-xl font-semibold text-foreground mb-6">
        {isEditing ? "Editar Paciente" : "Novo Paciente"}
      </h2>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
            Nome *
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

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">
            Telefone (WhatsApp) *
          </label>
          <input
            id="phone"
            type="tel"
            {...register("phone")}
            placeholder="11999999999"
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          />
          {errors.phone && (
            <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Formato: DDD + numero (ex: 11999999999)
          </p>
        </div>

        {/* Additional Phones Section */}
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-foreground">
              Telefones adicionais
            </label>
            <button
              type="button"
              onClick={onAddPhone}
              disabled={additionalPhones.length >= 4}
              className="text-sm text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
            >
              + Adicionar telefone
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Contatos adicionais (mae, pai, responsavel, etc.). Clique no sino para ativar/desativar notificacoes.
          </p>
          {additionalPhones.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhum telefone adicional
            </p>
          ) : (
            <div className="space-y-3">
              {additionalPhones.map((phone, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="Rotulo (ex: Mae, Trabalho)"
                      value={phone.label}
                      onChange={(e) => onUpdatePhone(index, "label", e.target.value)}
                      maxLength={30}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="tel"
                      placeholder="11999999999"
                      value={phone.phone}
                      onChange={(e) => onUpdatePhone(index, "phone", e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdatePhone(index, "notify", !phone.notify)}
                    className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-md transition-colors ${
                      phone.notify !== false
                        ? "text-primary hover:bg-primary/10"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    title={phone.notify !== false ? "Recebe notificacoes" : "Nao recebe notificacoes"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {phone.notify !== false ? (
                        <>
                          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </>
                      ) : (
                        <>
                          <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
                          <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
                          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      )}
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePhone(index)}
                    className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remover telefone"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          {additionalPhones.length >= 4 && (
            <p className="text-xs text-muted-foreground mt-2">
              Maximo de 4 telefones adicionais atingido
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            />
            {errors.email && (
              <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="birthDate" className="block text-sm font-medium text-foreground mb-2">
              Data de Nascimento
            </label>
            <Controller
              name="birthDate"
              control={control}
              render={({ field }) => (
                <DatePickerInput
                  id="birthDate"
                  value={field.value || ""}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="fatherName" className="block text-sm font-medium text-foreground mb-2">
              Nome do Pai
            </label>
            <input
              id="fatherName"
              type="text"
              {...register("fatherName")}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            />
            {errors.fatherName && (
              <p className="text-sm text-destructive mt-1">{errors.fatherName.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="motherName" className="block text-sm font-medium text-foreground mb-2">
              Nome da Mae
            </label>
            <input
              id="motherName"
              type="text"
              {...register("motherName")}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            />
            {errors.motherName && (
              <p className="text-sm text-destructive mt-1">{errors.motherName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="schoolName" className="block text-sm font-medium text-foreground mb-2">
            Nome da Escola
          </label>
          <input
            id="schoolName"
            type="text"
            {...register("schoolName")}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstAppointmentDate" className="block text-sm font-medium text-foreground mb-2">
              Data Primeiro Atendimento
            </label>
            <Controller
              name="firstAppointmentDate"
              control={control}
              render={({ field }) => (
                <DatePickerInput
                  id="firstAppointmentDate"
                  value={field.value || ""}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <div>
            <label htmlFor="sessionFee" className="block text-sm font-medium text-foreground mb-2">
              {getFeeLabel(billingMode)} (R$)
            </label>
            <input
              id="sessionFee"
              type="text"
              inputMode="decimal"
              {...register("sessionFee")}
              placeholder="150.00"
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            />
          </div>
        </div>

        <div>
          <label htmlFor="lastFeeAdjustmentDate" className="block text-sm font-medium text-foreground mb-2">
            Data Ultimo Reajuste
          </label>
          <Controller
            name="lastFeeAdjustmentDate"
            control={control}
            render={({ field }) => (
              <DatePickerInput
                id="lastFeeAdjustmentDate"
                value={field.value || ""}
                onChange={field.onChange}
              />
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Atualizado automaticamente ao alterar o valor da sessão
          </p>
        </div>

        <div>
          <label htmlFor="therapeuticProject" className="block text-sm font-medium text-foreground mb-2">
            Projeto Terapeutico
          </label>
          <textarea
            id="therapeuticProject"
            rows={4}
            {...register("therapeuticProject")}
            placeholder="Descreva o projeto terapeutico do paciente..."
            className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-2">
            Observacoes
          </label>
          <textarea
            id="notes"
            rows={3}
            {...register("notes")}
            placeholder="Observacoes internas sobre o paciente..."
            className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
          />
          {errors.notes && (
            <p className="text-sm text-destructive mt-1">{errors.notes.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="referenceProfessionalId" className="block text-sm font-medium text-foreground mb-2">
            Profissional de Referencia
          </label>
          <select
            id="referenceProfessionalId"
            {...register("referenceProfessionalId")}
            disabled={isLoadingProfessionals}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors disabled:opacity-50"
          >
            <option value="">Nenhum selecionado</option>
            {professionals
              .filter((prof) => prof.professionalProfile)
              .map((prof) => (
                <option key={prof.professionalProfile!.id} value={prof.professionalProfile!.id}>
                  {prof.name}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Profissional responsavel principal pelo paciente
          </p>
        </div>

        {/* LGPD Consent Section */}
        <div className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">
            Consentimentos LGPD
          </h3>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                {...register("consentWhatsApp")}
                className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <div>
                <span className="text-sm text-foreground">
                  Autorizo receber mensagens via WhatsApp
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lembretes de consulta, confirmacoes e comunicacoes da clinica
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                {...register("consentEmail")}
                className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <div>
                <span className="text-sm text-foreground">
                  Autorizo receber comunicacoes por email
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lembretes de consulta, confirmacoes e comunicacoes da clinica
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSaving
              ? "Salvando..."
              : isEditing
              ? "Salvar alteracoes"
              : "Criar paciente"}
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
