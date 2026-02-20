"use client"

import { GroupDetails } from "./types"
import { getTodayISO } from "./constants"
import { MemberCard } from "./MemberCard"
import { AddMemberForm } from "./AddMemberForm"

interface MembersTabProps {
  viewingGroup: GroupDetails
  canWrite: boolean
  isAddingMember: boolean
  selectedPatient: { id: string; name: string } | null
  patientSearch: string
  patientSearchResults: Array<{ id: string; name: string; phone: string }>
  isSearchingPatients: boolean
  memberJoinDate: string
  isSavingMember: boolean
  onStartAddMember: () => void
  onPatientSearch: (value: string) => void
  onSelectPatient: (patient: { id: string; name: string }) => void
  onClearPatient: () => void
  onJoinDateChange: (value: string) => void
  onAddMember: () => void
  onCancelAddMember: () => void
  onRemoveMember: (membershipId: string, patientName: string) => void
}

export function MembersTab({
  viewingGroup,
  canWrite,
  isAddingMember,
  selectedPatient,
  patientSearch,
  patientSearchResults,
  isSearchingPatients,
  memberJoinDate,
  isSavingMember,
  onStartAddMember,
  onPatientSearch,
  onSelectPatient,
  onClearPatient,
  onJoinDateChange,
  onAddMember,
  onCancelAddMember,
  onRemoveMember,
}: MembersTabProps) {
  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        {canWrite && viewingGroup.isActive && !isAddingMember && (
          <button
            onClick={() => {
              onStartAddMember()
            }}
            className="h-8 px-3 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
          >
            + Adicionar Membro
          </button>
        )}
      </div>

      {/* Add Member Form */}
      {isAddingMember && (
        <AddMemberForm
          selectedPatient={selectedPatient}
          patientSearch={patientSearch}
          patientSearchResults={patientSearchResults}
          isSearchingPatients={isSearchingPatients}
          memberJoinDate={memberJoinDate}
          isSavingMember={isSavingMember}
          onPatientSearch={onPatientSearch}
          onSelectPatient={onSelectPatient}
          onClearPatient={onClearPatient}
          onJoinDateChange={onJoinDateChange}
          onAdd={onAddMember}
          onCancel={onCancelAddMember}
        />
      )}

      {viewingGroup.memberships.length > 0 ? (
        <div className="space-y-3">
          {viewingGroup.memberships.map((membership) => (
            <MemberCard
              key={membership.id}
              membership={membership}
              canRemove={canWrite}
              onRemove={onRemoveMember}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Nenhum membro cadastrado. {canWrite && viewingGroup.isActive && "Clique em \"+ Adicionar Membro\" para começar."}
        </p>
      )}
    </div>
  )
}
