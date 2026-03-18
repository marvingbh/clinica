import { useState, useMemo, useCallback } from "react"
import type { GroupSession } from "../lib/types"

interface SessionKey {
  groupId: string | null
  scheduledAt: string
}

export interface UseGroupSessionSheetReturn {
  isOpen: boolean
  selectedSession: GroupSession | null
  open: (session: GroupSession) => void
  close: () => void
}

export function useGroupSessionSheet(groupSessions: GroupSession[]): UseGroupSessionSheetReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<SessionKey | null>(null)

  // Derived state: resolve the full session object from the key
  const selectedSession = useMemo(() => {
    if (!selectedKey) return null
    return groupSessions.find(
      s => s.groupId === selectedKey.groupId && s.scheduledAt === selectedKey.scheduledAt
    ) ?? null
  }, [selectedKey, groupSessions])

  const open = useCallback((session: GroupSession) => {
    setSelectedKey({ groupId: session.groupId, scheduledAt: session.scheduledAt })
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setSelectedKey(null)
  }, [])

  return { isOpen, selectedSession, open, close }
}
