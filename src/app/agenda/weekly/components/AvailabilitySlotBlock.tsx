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
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: "1px",
        right: "1px",
      }}
      className={`
        rounded px-1 py-0.5 text-left overflow-hidden cursor-pointer
        border border-dashed transition-all hover:shadow-sm
        ${isBiweeklyHint
          ? "border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-100/50 dark:hover:bg-purple-950/40"
          : "border-muted-foreground/30 bg-muted/20 hover:bg-muted/40"
        }
      `}
    >
      <div className="h-full flex flex-col items-center justify-center gap-0.5 overflow-hidden">
        {isBiweeklyHint ? (
          <>
            <ArrowLeftRightIcon className="w-3 h-3 text-purple-500 dark:text-purple-400 flex-shrink-0" />
            <span className="text-[9px] text-purple-600 dark:text-purple-400 truncate max-w-full leading-tight">
              {slot.biweeklyHint!.patientName}
            </span>
          </>
        ) : (
          <>
            <PlusIcon className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
            <span className="text-[9px] text-muted-foreground/60 leading-tight">Disp.</span>
          </>
        )}
      </div>
    </button>
  )
}
