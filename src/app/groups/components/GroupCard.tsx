"use client"

import {
  UsersIcon,
  ClockIcon,
} from "@/shared/components/ui"
import { TherapyGroup } from "./types"
import { DAY_OF_WEEK_LABELS, RECURRENCE_TYPE_LABELS } from "./constants"

interface GroupCardProps {
  group: TherapyGroup
  canWrite: boolean
  onView: (group: TherapyGroup) => void
  onEdit: (group: TherapyGroup) => void
  onDeactivate: (group: TherapyGroup) => void
  onReactivate: (group: TherapyGroup) => void
}

export function GroupCard({ group, canWrite, onView, onEdit, onDeactivate, onReactivate }: GroupCardProps) {
  return (
    <div
      className={`bg-card border border-border rounded-lg p-4 sm:p-6 ${
        !group.isActive ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onView(group)}
        >
          <div className="flex items-center gap-2 mb-1">
            <UsersIcon className="w-5 h-5 text-purple-600" />
            <h3 className="font-medium text-foreground truncate">
              {group.name}
            </h3>
            {!group.isActive && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Inativo
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ClockIcon className="w-4 h-4" />
            <span>
              {DAY_OF_WEEK_LABELS[group.dayOfWeek]} às {group.startTime}
            </span>
            <span className="text-muted-foreground/50">&bull;</span>
            <span>{RECURRENCE_TYPE_LABELS[group.recurrenceType]}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {group.professionalProfile.user.name}
            {group.additionalProfessionals && group.additionalProfessionals.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {" "}+{group.additionalProfessionals.length}
              </span>
            )}
          </p>
          <div className="flex gap-3 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">
              {group.activeMemberCount ?? 0} membro{(group.activeMemberCount ?? 0) !== 1 ? "s" : ""}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {group.duration} min
            </span>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(group)}
              className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
            >
              Editar
            </button>
            {group.isActive ? (
              <button
                onClick={() => onDeactivate(group)}
                className="h-9 px-3 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Desativar
              </button>
            ) : (
              <button
                onClick={() => onReactivate(group)}
                className="h-9 px-3 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Reativar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
