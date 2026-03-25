"use client"

import { PROFESSIONAL_COLORS, type ProfessionalColorMap } from "../lib/professional-colors"
import type { Professional } from "../lib/types"

interface ProfessionalLegendProps {
  professionals: Professional[]
  colorMap: ProfessionalColorMap
}

export function ProfessionalLegend({ professionals, colorMap }: ProfessionalLegendProps) {
  if (colorMap.size <= 1) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2">
      {professionals
        .filter(p => p.professionalProfile?.id && colorMap.has(p.professionalProfile.id))
        .map(p => {
          const profId = p.professionalProfile!.id
          const colorIndex = colorMap.get(profId) ?? 0
          const color = PROFESSIONAL_COLORS[colorIndex]
          return (
            <div key={profId} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${color.accent}`} />
              <span className="text-xs text-muted-foreground">{p.name.split(" ")[0]}</span>
            </div>
          )
        })}
    </div>
  )
}
