"use client"

import { useState } from "react"
import { Sheet } from "./Sheet"
import { updateStatus, updateGroupSessionStatus } from "../services/appointmentService"
import { CancelConfirmDialog } from "./CancelConfirmDialog"
import { getCancelVariant } from "@/lib/appointments/status-transitions"
import { toast } from "sonner"
import type { GroupSession, AppointmentStatus, Professional } from "../lib/types"
import type { CancelContext, CancelVariant } from "./group-session/types"
import { GroupSessionHeader, GroupProfessionalEdit, GroupParticipantList, GroupMemberActions } from "./group-session"

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
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)
  const [cancelContext, setCancelContext] = useState<CancelContext | null>(null)

  if (!session) return null

  const handleUpdateStatus = async (appointmentId: string, newStatus: string, patientName: string) => {
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
        isBulkUpdating={isBulkUpdating}
        onBulkUpdateStatus={handleBulkUpdateStatus}
      />

      {/* Member management — only for recurring groups (have groupId) */}
      {session.groupId && (
        <GroupMemberActions
          session={session}
          onMemberChanged={onStatusUpdated}
        />
      )}

      {isAdmin && professionals.length > 1 && (
        <GroupProfessionalEdit
          session={session}
          professionals={professionals}
          onStatusUpdated={onStatusUpdated}
        />
      )}

      <GroupParticipantList
        participants={session.participants}
        updatingId={updatingId}
        isBulkUpdating={isBulkUpdating}
        onUpdateStatus={handleUpdateStatus}
        onOpenCancel={openIndividualCancel}
      />

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <button type="button" onClick={onClose} className="w-full h-10 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted">
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
