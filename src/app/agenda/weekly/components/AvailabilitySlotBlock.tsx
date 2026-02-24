"use client"

import { PlusIcon, ArrowLeftRightIcon } from "@/shared/components/ui/icons"
import type { TimeSlot } from "../../lib/types"

const PIXELS_PER_MINUTE = 1.6
const START_HOUR = 7

interface AvailabilitySlotBlockProps {
  slot: TimeSlot
  appointmentDuration: number
  onClick: () => void
}

export function AvailabilitySlotBlock({
  slot,
  appointmentDuration,
  onClick,
}: AvailabilitySlotBlockProps) {
  const [hour, min] = slot.time.split(":").map(Number)
  const top = ((hour - START_HOUR) * 60 + min) * PIXELS_PER_MINUTE
  const height = Math.max(appointmentDuration * PIXELS_PER_MINUTE, 32)

  const isBiweeklyHint = !!slot.biweeklyHint

  return (
    <button
      type="button"
      onClick={onClick}
      title={isBiweeklyHint ? slot.biweeklyHint!.patientName : undefined}
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: "1px",
        right: "1px",
      }}
      className={`
        rounded px-1 py-0.5 text-left overflow-hidden cursor-pointer
        rounded-md transition-all hover:shadow-sm
        border border-teal-300/70 dark:border-teal-600/50 border-l-[3px] border-l-teal-500 dark:border-l-teal-400 bg-teal-50/80 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-800/40
      `}
    >
      <div className="h-full flex flex-col items-center justify-center gap-1 overflow-hidden">
        {isBiweeklyHint ? (
          (() => {
            const endMin = hour * 60 + min + appointmentDuration
            const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
            return <>
              <span className="text-[10px] text-teal-700 dark:text-teal-300 font-bold leading-tight">+ Disponivel</span>
              <div className="flex items-center gap-0.5">
                <ArrowLeftRightIcon className="w-3 h-3 flex-shrink-0 text-teal-600/70 dark:text-teal-400/70" />
                <span className="text-[9px] text-teal-600/70 dark:text-teal-400/70 leading-tight">{slot.biweeklyHint!.patientName.length > 18 ? `${slot.biweeklyHint!.patientName.slice(0, 18)}…` : slot.biweeklyHint!.patientName}</span>
              </div>
              <span className="text-[9px] text-teal-600/70 dark:text-teal-400/70 leading-tight">{slot.time} - {endTime}</span>
            </>
          })()
        ) : (
          (() => {
            const endMin = hour * 60 + min + appointmentDuration
            const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
            return <>
              <span className="text-[10px] text-teal-700 dark:text-teal-300 font-bold leading-tight">+ Disponivel</span>
              <span className="text-[9px] text-teal-600/70 dark:text-teal-400/70 leading-tight">{slot.time} - {endTime}</span>
            </>
          })()
        )}
      </div>
    </button>
  )
}
