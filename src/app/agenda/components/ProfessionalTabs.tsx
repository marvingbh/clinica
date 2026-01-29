"use client"

import { Professional } from "../lib/types"

interface ProfessionalTabsProps {
  professionals: Professional[]
  selectedId: string
  onChange: (id: string) => void
}

export function ProfessionalTabs({ professionals, selectedId, onChange }: ProfessionalTabsProps) {
  if (professionals.length === 0) return null

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
      <button
        type="button"
        onClick={() => onChange("")}
        className={`
          flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors
          ${selectedId === ""
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
          }
        `}
      >
        Todos
      </button>
      {professionals.map((prof) => {
        const profId = prof.professionalProfile?.id || ""
        const isSelected = selectedId === profId
        return (
          <button
            key={prof.id}
            type="button"
            onClick={() => onChange(profId)}
            className={`
              flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
              ${isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
              }
            `}
          >
            {prof.name}
          </button>
        )
      })}
    </div>
  )
}
