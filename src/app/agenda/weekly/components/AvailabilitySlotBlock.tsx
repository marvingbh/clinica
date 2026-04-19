"use client"

import { PlusIcon, ArrowLeftRightIcon } from "@/shared/components/ui/icons"
import type { TimeSlot } from "../../lib/types"
import { WEEKLY_GRID } from "../../lib/grid-config"

const { pixelsPerMinute: PIXELS_PER_MINUTE, startHour: START_HOUR } = WEEKLY_GRID

interface AvailabilitySlotBlockProps {
  slot: TimeSlot
  appointmentDuration: number
  onClick: () => void
  halfRight?: boolean
  isPast?: boolean
}

export function AvailabilitySlotBlock({
  slot,
  appointmentDuration,
  onClick,
  halfRight = false,
  isPast = false,
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
        left: halfRight ? "50%" : "1px",
        right: "1px",
      }}
      className={`
        rounded px-1 py-0.5 text-left overflow-hidden cursor-pointer
        rounded-md transition-all hover:shadow-sm
        ${isPast
          ? "border border-border/50 border-l-[3px] border-l-muted-foreground/30 bg-muted/30 opacity-40"
          : "border border-teal-300/70 border-l-[3px] border-l-teal-500 bg-teal-50/80 hover:bg-teal-100"
        }
      `}
    >
      <div className="h-full flex flex-col items-center justify-center gap-1 overflow-hidden">
        {isBiweeklyHint ? (
          (() => {
            const endMin = hour * 60 + min + appointmentDuration
            const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
            return <>
              <span className="text-[10px] text-teal-700 font-bold leading-tight">+ Disponivel</span>
              <div className="flex items-center gap-0.5">
                <ArrowLeftRightIcon className="w-3 h-3 flex-shrink-0 text-teal-600/70" />
                <span className="text-[9px] text-teal-600/70 leading-tight">{slot.biweeklyHint!.patientName.length > 18 ? `${slot.biweeklyHint!.patientName.slice(0, 18)}…` : slot.biweeklyHint!.patientName}</span>
              </div>
              <span className="text-[9px] text-teal-600/70 leading-tight">{slot.time} - {endTime}</span>
            </>
          })()
        ) : (
          (() => {
            const endMin = hour * 60 + min + appointmentDuration
            const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
            return <>
              <span className="text-[10px] text-teal-700 font-bold leading-tight">+ Disponivel</span>
              <span className="text-[9px] text-teal-600/70 leading-tight">{slot.time} - {endTime}</span>
            </>
          })()
        )}
      </div>
    </button>
  )
}
