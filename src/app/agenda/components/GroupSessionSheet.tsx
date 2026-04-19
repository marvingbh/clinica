"use client"

import { useState } from "react"
import { Sheet } from "./Sheet"
import { updateStatus, updateGroupSessionStatus } from "../services/appointmentService"
import { CancelConfirmDialog } from "./CancelConfirmDialog"
import { getCancelVariant } from "@/lib/appointments/status-transitions"
import { toast } from "sonner"
import type { GroupSession, AppointmentStatus, Professional } from "../lib/types"
import type { CancelContext, CancelVariant } from "./group-session/types"
import { GroupSessionHeader, GroupProfessionalEdit, GroupParticipantList, GroupMemberActions, GroupRecurrenceTab } from "./group-session"

type SheetTab = "session" | "members" | "recurrence"

interface GroupSessionSheetProps {
  isOpen: boolean
  onClose: () => void
  session: GroupSession | null
  onStatusUpdated: () => void
  professionals?: Professional[]
  isAdmin?: boolean
}

// Parent must use key={session?.id} to reset this component
export function GroupSessionSheet({
  isOpen,
  onClose,
  session,
  onStatusUpdated,
  professionals = [],
  isAdmin = false,
}: GroupSessionSheetProps) {
  const [activeTab, setActiveTab] = useState<SheetTab>("session")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)
  const [cancelContext, setCancelContext] = useState<CancelContext | null>(null)

  if (!session) return null

  const isRecurring = !!session.groupId

  const tabs: Array<{ key: SheetTab; label: string }> = [
    { key: "session", label: "Sessão" },
    { key: "members", label: "Membros" },
  ]
  if (isRecurring) {
    tabs.push({ key: "recurrence", label: "Recorrência" })
  }

  const handleUpdateStatus = async (appointmentId: string, newStatus: AppointmentStatus, patientName: string) => {
    setUpdatingId(appointmentId)
    try {
      const result = await updateStatus(appointmentId, newStatus)
      if (result.error) { toast.error(result.error) }
      else {
        const msgs: Record<string, string> = {
          FINALIZADO: `${patientName} marcado como compareceu`,
          CANCELADO_FALTA: `${patientName} marcado como falta`,
          CANCELADO_ACORDADO: `${patientName} marcado como desmarcou`,
          CANCELADO_PROFISSIONAL: `${patientName} marcado como sem cobrança`,
          CONFIRMADO: `${patientName} confirmado`,
          AGENDADO: `${patientName} reagendado`,
        }
        toast.success(msgs[newStatus] || "Status atualizado")
        onStatusUpdated()
      }
    } catch { toast.error("Erro ao atualizar status") }
    finally { setUpdatingId(null) }
  }

  const handleBulkUpdateStatus = async (newStatus: AppointmentStatus) => {
    const cancelVariant = getCancelVariant(newStatus)
    if (cancelVariant) { setCancelContext({ variant: cancelVariant, isBulk: true }); return }

    const msgs: Record<string, string> = { CONFIRMADO: "Confirmar todos os participantes", FINALIZADO: "Marcar todos como compareceram" }
    if (!window.confirm(`${msgs[newStatus] || "Atualizar todos"}?`)) return
    await executeBulkUpdate(newStatus)
  }

  const executeBulkUpdate = async (newStatus: string) => {
    setIsBulkUpdating(true)
    try {
      const result = await updateGroupSessionStatus(session.groupId, session.scheduledAt, newStatus, session.sessionGroupId)
      if (result.error) { toast.error(result.error) }
      else { toast.success(`${result.updatedCount} participantes atualizados`); onStatusUpdated() }
    } catch { toast.error("Erro ao atualizar status do grupo") }
    finally { setIsBulkUpdating(false) }
  }

  const handleCancelConfirm = async (status: string, _reason: string) => {
    if (!cancelContext) return
    if (cancelContext.isBulk) { await executeBulkUpdate(status) }
    else if (cancelContext.appointmentId && cancelContext.patientName) {
      await handleUpdateStatus(cancelContext.appointmentId, status as AppointmentStatus, cancelContext.patientName)
    }
  }

  const openIndividualCancel = (variant: CancelVariant, appointmentId: string, patientName: string) => {
    setCancelContext({ variant, isBulk: false, appointmentId, patientName })
  }

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={session.groupName}>
      <GroupSessionHeader
        session={session}
        onStatusUpdated={onStatusUpdated}
        onDeleted={() => { onStatusUpdated(); onClose() }}
        isBulkUpdating={isBulkUpdating}
        onBulkUpdateStatus={handleBulkUpdateStatus}
      />

      {/* Tabs — Clinica tokens: ink-100 track, ink-0 active pill, 4px radius */}
      <div className="px-4 pt-3">
        <div className="flex rounded-[4px] bg-ink-100 p-[3px] border border-ink-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 h-8 rounded-[3px] text-[13px] font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-card text-brand-700 shadow-sm"
                  : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Session tab — attendance management */}
      {activeTab === "session" && (
        <GroupParticipantList
          participants={session.participants}
          updatingId={updatingId}
          isBulkUpdating={isBulkUpdating}
          onUpdateStatus={handleUpdateStatus}
          onOpenCancel={openIndividualCancel}
        />
      )}

      {/* Members tab — member management + professionals */}
      {activeTab === "members" && (
        <>
          <GroupMemberActions
            session={session}
            onMemberChanged={onStatusUpdated}
          />

          {isAdmin && professionals.length > 1 && (
            <GroupProfessionalEdit
              session={session}
              professionals={professionals}
              onStatusUpdated={onStatusUpdated}
            />
          )}
        </>
      )}

      {/* Recurrence tab — for recurring groups */}
      {activeTab === "recurrence" && isRecurring && (
        <GroupRecurrenceTab session={session} onSaved={onStatusUpdated} onClose={onClose} />
      )}

      {/* Footer — same language as Create sheets */}
      <div className="border-t border-ink-200 bg-ink-50 px-4 md:px-6 py-3.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-4 rounded-[4px] text-ink-700 font-medium text-[13px] hover:bg-ink-100 transition-colors"
        >
          Fechar
        </button>
      </div>

      {cancelContext && (
        <CancelConfirmDialog
          isOpen={!!cancelContext}
          onClose={() => setCancelContext(null)}
          variant={cancelContext.variant}
          onConfirm={handleCancelConfirm}
        />
      )}
    </Sheet>
  )
}
