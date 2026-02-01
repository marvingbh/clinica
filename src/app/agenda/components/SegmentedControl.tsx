"use client"

import { ReactNode } from "react"

export interface Segment {
  key: string
  label: string
  icon?: ReactNode
}

interface SegmentedControlProps {
  segments: Segment[]
  activeKey: string
  onChange: (key: string) => void
  trailing?: ReactNode
  className?: string
}

export function SegmentedControl({
  segments,
  activeKey,
  onChange,
  trailing,
  className = "",
}: SegmentedControlProps) {
  return (
    <div className={`flex items-center gap-1 p-1 bg-muted rounded-lg ${className}`}>
      <div className="flex flex-1 gap-1">
        {segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={() => onChange(segment.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] ${
              activeKey === segment.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {segment.icon}
            <span>{segment.label}</span>
          </button>
        ))}
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </div>
  )
}
