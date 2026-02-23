"use client"

import { useRouter } from "next/navigation"
import { formatDayHeader, isSameDay, isWeekend, toDateString } from "../../lib/utils"

interface DayHeaderProps {
  date: Date
  birthdayNames?: string[]
}

export function DayHeader({ date, birthdayNames = [] }: DayHeaderProps) {
  const router = useRouter()
  const { dayName, dayNumber } = formatDayHeader(date)
  const isToday = isSameDay(date, new Date())
  const weekend = isWeekend(date)

  function handleClick() {
    router.push(`/agenda?date=${toDateString(date)}`)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        flex flex-col items-center justify-center py-2 px-1 min-w-[60px]
        hover:bg-muted/50 transition-colors rounded-md cursor-pointer
        ${weekend ? "text-muted-foreground" : ""}
      `}
    >
      <span className="text-xs font-medium uppercase">{dayName}</span>
      <span
        className={`
          text-lg font-semibold mt-0.5 w-8 h-8 flex items-center justify-center rounded-full
          ${isToday ? "bg-primary text-primary-foreground" : ""}
        `}
      >
        {dayNumber}
      </span>
      {birthdayNames.length > 0 && (
        <div className="flex flex-col items-center mt-0.5 max-w-[110px]">
          {birthdayNames.map((name, i) => (
            <span
              key={i}
              className="text-[10px] leading-tight text-amber-700 dark:text-amber-300 truncate w-full text-center"
              title={name}
            >
              🎂 {name}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
