"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/app/agenda/components/Sheet"
import { PatientSearch } from "@/app/agenda/components/PatientSearch"
import { PreferencesFields } from "./PreferencesFields"
import type { Patient } from "@/app/agenda/lib/types"
import type { ProfessionalLite } from "@/lib/professionals/list"
import type { WaitlistPreferences } from "@/lib/waitlist"
import type { SerializedWaitlistEntry } from "../types"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  professionals: ProfessionalLite[]
  /** When set, the sheet edits an existing entry; otherwise it creates a new one. */
  editing?: SerializedWaitlistEntry | null
  /** Pre-selected patient (e.g. from the patient page). */
  initialPatient?: Patient | null
}

const EMPTY_PREFS: WaitlistPreferences = { weekdays: [], timeRanges: [], modality: null }

export function WaitlistEntrySheet({
  isOpen,
  onClose,
  onSaved,
  professionals,
  editing,
  initialPatient,
}: Props) {
  const isEdit = !!editing
  const [isLead, setIsLead] = useState(false)
  const [patientName, setPatientName] = useState(initialPatient?.name ?? "")
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initialPatient ?? null)
  const [leadName, setLeadName] = useState("")
  const [leadPhone, setLeadPhone] = useState("")
  const [leadEmail, setLeadEmail] = useState("")
  const [professionalId, setProfessionalId] = useState<string>(
    editing?.professionalProfileId ?? ""
  )
  const [preferences, setPreferences] = useState<WaitlistPreferences>(
    editing?.preferences ?? EMPTY_PREFS
  )
  const [priorityNote, setPriorityNote] = useState(editing?.priorityNote ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    setSaving(true)
    try {
      if (isEdit && editing) {
        const res = await fetch(`/api/waitlist/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            professionalProfileId: professionalId || null,
            preferences,
            priorityNote: priorityNote.trim() || null,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Falha ao salvar")
        }
        toast.success("Entrada atualizada")
      } else {
        const body = isLead
          ? {
              leadName: leadName.trim(),
              leadPhone: leadPhone.trim(),
              leadEmail: leadEmail.trim() || undefined,
              professionalProfileId: professionalId || null,
              preferences,
              priorityNote: priorityNote.trim() || undefined,
            }
          : {
              patientId: selectedPatient?.id,
              professionalProfileId: professionalId || null,
              preferences,
              priorityNote: priorityNote.trim() || undefined,
            }

        if (!isLead && !selectedPatient) {
          toast.error("Selecione um paciente")
          setSaving(false)
          return
        }
        if (isLead && (!leadName.trim() || !leadPhone.trim())) {
          toast.error("Lead exige nome e telefone")
          setSaving(false)
          return
        }

        const res = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Falha ao adicionar")
        }
        toast.success("Adicionado à lista de espera")
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Editar entrada" : "Adicionar à lista de espera"}
    >
      <div className="p-4 space-y-5">
        {!isEdit && (
          <>
            <label className="flex items-center gap-2 text-[13px] text-ink-700">
              <input
                type="checkbox"
                checked={isLead}
                onChange={(e) => setIsLead(e.target.checked)}
              />
              Ainda não é paciente (lead)
            </label>

            {isLead ? (
              <div className="space-y-3">
                <Field label="Nome *" value={leadName} onChange={setLeadName} placeholder="Nome do lead" />
                <Field label="Telefone *" value={leadPhone} onChange={setLeadPhone} placeholder="(11) 99999-9999" />
                <Field label="E-mail" value={leadEmail} onChange={setLeadEmail} placeholder="opcional" />
              </div>
            ) : (
              <PatientSearch
                value={patientName}
                onChange={setPatientName}
                selectedPatient={selectedPatient}
                onSelectPatient={setSelectedPatient}
                onClearPatient={() => setSelectedPatient(null)}
              />
            )}
          </>
        )}

        <div>
          <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Profissional</label>
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="w-full h-10 px-2 rounded-md border border-ink-300 bg-card text-[13px]"
          >
            <option value="">Qualquer profissional</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <PreferencesFields value={preferences} onChange={setPreferences} />

        <div>
          <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
            Nota de prioridade
          </label>
          <textarea
            value={priorityNote}
            onChange={(e) => setPriorityNote(e.target.value)}
            rows={2}
            placeholder="Ex.: prefere manhã, urgente, indicação..."
            className="w-full px-2 py-2 rounded-md border border-ink-300 bg-card text-[13px]"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 pb-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-10 rounded-md border border-ink-300 text-[13px] text-ink-700 hover:bg-ink-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-ink-700 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-2 rounded-md border border-ink-300 bg-card text-[13px]"
      />
    </div>
  )
}
