"use client"

import { useState, useCallback } from "react"
import { PlusIcon, XIcon } from "@/shared/components/ui/icons"
import { toast } from "sonner"
import { PatientSearch } from "../PatientSearch"
import { MemberScopeDialog, type MemberScope } from "./MemberScopeDialog"
import {
  addGroupMember,
  removeGroupMember,
  regenerateGroupSessions,
  createAppointment,
  deleteAppointment,
} from "../../services/appointmentService"
import type { GroupSession } from "./types"
import type { Patient } from "../../lib/types"

interface GroupMemberActionsProps {
  session: GroupSession
  onMemberChanged: () => void
}

interface PendingAction {
  type: "add" | "remove"
  patient: { id: string; name: string }
  appointmentId?: string
}

export function GroupMemberActions({ session, onMemberChanged }: GroupMemberActionsProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const sessionDate = new Date(session.scheduledAt)
  const sessionDateStr = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, "0")}-${String(sessionDate.getDate()).padStart(2, "0")}`
  const sessionTime = `${String(sessionDate.getHours()).padStart(2, "0")}:${String(sessionDate.getMinutes()).padStart(2, "0")}`
  const durationMs = new Date(session.endAt).getTime() - sessionDate.getTime()
  const durationMin = Math.round(durationMs / 60000)

  const handleSelectPatient = useCallback((patient: Patient) => {
    setSelectedPatient(patient)
    setPendingAction({ type: "add", patient: { id: patient.id, name: patient.name } })
  }, [])

  const handleRemoveClick = useCallback((appointmentId: string, patientId: string, patientName: string) => {
    setPendingAction({ type: "remove", patient: { id: patientId, name: patientName }, appointmentId })
  }, [])

  const handleScopeSelect = async (scope: MemberScope) => {
    if (!pendingAction || !session.groupId) return
    setIsProcessing(true)

    try {
      if (pendingAction.type === "add") {
        await executeAdd(scope, pendingAction.patient)
      } else {
        await executeRemove(scope, pendingAction.patient, pendingAction.appointmentId!)
      }
    } finally {
      setIsProcessing(false)
      setPendingAction(null)
      setSelectedPatient(null)
      setPatientSearch("")
      setIsAdding(false)
    }
  }

  const executeAdd = async (scope: MemberScope, patient: { id: string; name: string }) => {
    if (scope === "this_only") {
      const result = await createAppointment({
        patientId: patient.id,
        date: sessionDateStr,
        startTime: sessionTime,
        duration: durationMin,
        modality: "PRESENCIAL",
        professionalProfileId: session.professionalProfileId,
      })
      if (result.error) { toast.error(result.error); return }
      toast.success(`${patient.name} adicionado a esta sessão`)
    } else {
      const addResult = await addGroupMember(session.groupId!, patient.id, sessionDateStr)
      if (addResult.error) { toast.error(addResult.error); return }
      const regenResult = await regenerateGroupSessions(session.groupId!)
      if (regenResult.error) { toast.error(regenResult.error); return }
      toast.success(`${patient.name} adicionado ao grupo`)
    }
    onMemberChanged()
  }

  const executeRemove = async (scope: MemberScope, patient: { id: string; name: string }, appointmentId: string) => {
    if (scope === "this_only") {
      const result = await deleteAppointment(appointmentId)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${patient.name} removido desta sessão`)
    } else {
      const result = await removeGroupMember(session.groupId!, patient.id, sessionDateStr)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${patient.name} removido do grupo`)
    }
    onMemberChanged()
  }

  // Existing participant IDs to filter from search
  const existingPatientIds = new Set(session.participants.map(p => p.patientId))

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Membros do grupo
        </h3>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Adicionar
          </button>
        )}
      </div>

      {/* Add member search */}
      {isAdding && (
        <div className="mb-3">
          <PatientSearch
            value={patientSearch}
            onChange={setPatientSearch}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClearPatient={() => { setSelectedPatient(null); setPatientSearch("") }}
          />
          <button
            type="button"
            onClick={() => { setIsAdding(false); setPatientSearch(""); setSelectedPatient(null) }}
            className="text-xs text-muted-foreground hover:text-foreground mt-2"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Current participants with remove buttons */}
      <div className="space-y-1">
        {session.participants
          .filter(p => !["CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO", "CANCELADO_FALTA"].includes(p.status))
          .map((p) => (
            <div key={p.appointmentId} className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground truncate">{p.patientName}</span>
              <button
                type="button"
                onClick={() => handleRemoveClick(p.appointmentId, p.patientId, p.patientName)}
                disabled={isProcessing}
                className="flex-shrink-0 w-6 h-6 rounded-full text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                title={`Remover ${p.patientName}`}
              >
                <XIcon className="w-3.5 h-3.5 mx-auto" />
              </button>
            </div>
          ))}
      </div>

      {/* Scope dialog */}
      {pendingAction && (
        <MemberScopeDialog
          isOpen={!!pendingAction}
          onClose={() => setPendingAction(null)}
          onSelect={handleScopeSelect}
          action={pendingAction.type}
          patientName={pendingAction.patient.name}
        />
      )}
    </div>
  )
}
