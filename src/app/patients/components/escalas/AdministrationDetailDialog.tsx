"use client"

import { X } from "lucide-react"
import { getScaleDefinition, isScaleCode, severityChipColor } from "@/lib/scales"
import type { AdministrationRow } from "./types"

interface Props {
  administration: AdministrationRow
  onClose: () => void
}

/** Item-by-item answers of a completed administration (clinical reader only). */
export function AdministrationDetailDialog({ administration, onClose }: Props) {
  if (!isScaleCode(administration.scaleCode)) return null
  const def = getScaleDefinition(administration.scaleCode)
  const answers = administration.answers ?? {}

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{def.shortName}</h3>
            {administration.severityLabel && administration.totalScore !== null && (
              <p className="mt-1 text-sm text-gray-600">
                Pontuação {administration.totalScore}/{def.maxScore} —{" "}
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${severityChipColor(
                    def,
                    administration.severityLabel
                  )}`}
                >
                  {administration.severityLabel}
                </span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="space-y-3">
          {def.items.map((item, i) => {
            const value = answers[item.id]
            const opt = def.options.find((o) => o.value === value)
            const isRisk = def.riskItemIds.includes(item.id) && (value ?? 0) > 0
            return (
              <li key={item.id} className="text-sm">
                <p className="font-medium text-gray-800">
                  {i + 1}. {item.text}
                </p>
                <p className={`mt-0.5 ${isRisk ? "font-semibold text-red-600" : "text-gray-600"}`}>
                  {opt ? `${opt.value} — ${opt.label}` : "Sem resposta"}
                  {isRisk ? " ⚠" : ""}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
