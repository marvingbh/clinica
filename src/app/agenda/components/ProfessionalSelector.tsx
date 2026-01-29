"use client"

import { Professional } from "../lib/types"

interface ProfessionalSelectorProps {
  professionals: Professional[]
  selectedId: string
  onChange: (id: string) => void
}

export function ProfessionalSelector({ professionals, selectedId, onChange }: ProfessionalSelectorProps) {
  if (professionals.length === 0) return null

  return (
    <div className="mb-4">
      <label htmlFor="professional-select" className="block text-sm font-medium text-foreground mb-2">
        Profissional
      </label>
      <select
        id="professional-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
      >
        <option value="">Selecione um profissional</option>
        {professionals.map((prof) => (
          <option key={prof.id} value={prof.professionalProfile?.id || ""}>
            {prof.name}
            {prof.professionalProfile?.specialty && ` - ${prof.professionalProfile.specialty}`}
          </option>
        ))}
      </select>
    </div>
  )
}
