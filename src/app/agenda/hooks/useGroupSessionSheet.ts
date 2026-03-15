import { useState, useEffect } from "react"
import type { GroupSession } from "../lib/types"

export interface UseGroupSessionSheetReturn {
  isOpen: boolean
  selectedSession: GroupSession | null
  open: (session: GroupSession) => void
  close: () => void
}

export function useGroupSessionSheet(groupSessions: GroupSession[]): UseGroupSessionSheetReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<GroupSession | null>(null)

  const open = (session: GroupSession) => {
    setSelectedSession(session)
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
    setSelectedSession(null)
  }

  // Sync selectedGroupSession when data refreshes
  useEffect(() => {
    if (selectedSession && groupSessions.length > 0) {
      const updated = groupSessions.find(
        s => s.groupId === selectedSession.groupId && s.scheduledAt === selectedSession.scheduledAt
      )
      if (updated) setSelectedSession(updated)
    }
  }, [groupSessions, selectedSession])

  return { isOpen, selectedSession, open, close }
}
