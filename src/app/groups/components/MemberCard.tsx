"use client"

import { GroupDetails } from "./types"

interface MemberCardProps {
  membership: GroupDetails["memberships"][0]
  canRemove: boolean
  onRemove: (membershipId: string, patientName: string) => void
}

export function MemberCard({ membership, canRemove, onRemove }: MemberCardProps) {
  const isActive = !membership.leaveDate
  return (
    <div
      className={`bg-muted/50 rounded-lg p-4 ${!isActive ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">{membership.patient.name}</p>
          <p className="text-sm text-muted-foreground">{membership.patient.phone}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className={`text-xs px-2 py-1 rounded-full ${isActive ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
              {isActive ? "Ativo" : "Saiu"}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Desde {new Date(membership.joinDate).toLocaleDateString("pt-BR")}
            </p>
          </div>
          {canRemove && isActive && (
            <button
              type="button"
              onClick={() => onRemove(membership.id, membership.patient.name)}
              className="h-7 px-2 text-xs rounded border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
