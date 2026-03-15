import { useState, useCallback } from "react"
import type { CalendarEntryType } from "../lib/types"

export interface UseFabMenuReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  handleSelect: (type: CalendarEntryType | "CONSULTA") => void
}

export function useFabMenu(
  openCreateSheet: () => void,
  openEntrySheet: (type: Exclude<CalendarEntryType, "CONSULTA">) => void,
): UseFabMenuReturn {
  const [isOpen, setIsOpen] = useState(false)

  const handleSelect = useCallback((type: CalendarEntryType | "CONSULTA") => {
    setIsOpen(false)
    if (type === "CONSULTA") openCreateSheet()
    else openEntrySheet(type as Exclude<CalendarEntryType, "CONSULTA">)
  }, [openCreateSheet, openEntrySheet])

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    handleSelect,
  }
}
