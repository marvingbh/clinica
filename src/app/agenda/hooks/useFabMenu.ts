import { useState, useCallback } from "react"
import type { CalendarEntryType } from "../lib/types"
import type { FabMenuSelection } from "../components/AgendaFabMenu"

export interface UseFabMenuReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  handleSelect: (type: FabMenuSelection) => void
}

export function useFabMenu(
  openCreateSheet: () => void,
  openEntrySheet: (type: Exclude<CalendarEntryType, "CONSULTA">) => void,
  openGroupSessionSheet?: () => void,
): UseFabMenuReturn {
  const [isOpen, setIsOpen] = useState(false)

  const handleSelect = useCallback((type: FabMenuSelection) => {
    setIsOpen(false)
    if (type === "CONSULTA") openCreateSheet()
    else if (type === "GROUP_SESSION") openGroupSessionSheet?.()
    else openEntrySheet(type as Exclude<CalendarEntryType, "CONSULTA">)
  }, [openCreateSheet, openEntrySheet, openGroupSessionSheet])

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    handleSelect,
  }
}
