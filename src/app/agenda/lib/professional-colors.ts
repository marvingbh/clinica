// Professional color palette - distinct colors for different professionals
export const PROFESSIONAL_COLORS = [
  { bg: "bg-blue-100", border: "border-l-blue-500", text: "text-blue-700", accent: "bg-blue-500" },
  { bg: "bg-green-100", border: "border-l-green-500", text: "text-green-700", accent: "bg-green-500" },
  { bg: "bg-purple-100", border: "border-l-purple-500", text: "text-purple-700", accent: "bg-purple-500" },
  { bg: "bg-orange-100", border: "border-l-orange-500", text: "text-orange-700", accent: "bg-orange-500" },
  { bg: "bg-pink-100", border: "border-l-pink-500", text: "text-pink-700", accent: "bg-pink-500" },
  { bg: "bg-teal-100", border: "border-l-teal-500", text: "text-teal-700", accent: "bg-teal-500" },
  { bg: "bg-indigo-100", border: "border-l-indigo-500", text: "text-indigo-700", accent: "bg-indigo-500" },
  { bg: "bg-amber-100", border: "border-l-amber-500", text: "text-amber-700", accent: "bg-amber-500" },
  { bg: "bg-cyan-100", border: "border-l-cyan-500", text: "text-cyan-700", accent: "bg-cyan-500" },
  { bg: "bg-rose-100", border: "border-l-rose-500", text: "text-rose-700", accent: "bg-rose-500" },
  { bg: "bg-lime-100", border: "border-l-lime-500", text: "text-lime-700", accent: "bg-lime-500" },
  { bg: "bg-violet-100", border: "border-l-violet-500", text: "text-violet-700", accent: "bg-violet-500" },
]

export type ProfessionalColorMap = Map<string, number>

/**
 * Creates a color map that assigns unique color indices to each professional.
 * Professionals are sorted by ID to ensure consistent colors across renders.
 * If there are more professionals than colors, colors will be reused starting from the beginning.
 */
export function createProfessionalColorMap(professionalIds: string[]): ProfessionalColorMap {
  const uniqueIds = [...new Set(professionalIds)].sort()
  const colorMap = new Map<string, number>()

  uniqueIds.forEach((id, index) => {
    colorMap.set(id, index % PROFESSIONAL_COLORS.length)
  })

  return colorMap
}

/**
 * Gets the color for a professional from the color map.
 * Falls back to index 0 if the professional is not in the map.
 */
export function getProfessionalColor(professionalId: string, colorMap: ProfessionalColorMap) {
  const index = colorMap.get(professionalId) ?? 0
  return PROFESSIONAL_COLORS[index]
}
