"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { toDateString } from "../lib/utils"

const DATE_STORAGE_KEY = "clinica:selectedDate"
const PROFESSIONAL_STORAGE_KEY = "clinica:selectedProfessionalId"

function loadPersistedDate(): Date {
  if (typeof window === "undefined") return new Date()
  const stored = sessionStorage.getItem(DATE_STORAGE_KEY)
  if (stored) {
    const [year, month, day] = stored.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    if (!isNaN(date.getTime())) return date
  }
  return new Date()
}

function persistDate(date: Date) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(DATE_STORAGE_KEY, toDateString(date))
  }
}

function loadPersistedProfessionalId(): string {
  if (typeof window === "undefined") return ""
  return sessionStorage.getItem(PROFESSIONAL_STORAGE_KEY) || ""
}

function persistProfessionalId(id: string) {
  if (typeof window !== "undefined") {
    if (id) {
      sessionStorage.setItem(PROFESSIONAL_STORAGE_KEY, id)
    } else {
      sessionStorage.removeItem(PROFESSIONAL_STORAGE_KEY)
    }
  }
}

interface AgendaContextValue {
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  selectedProfessionalId: string
  setSelectedProfessionalId: (id: string) => void
  goToPreviousDay: () => void
  goToNextDay: () => void
  goToToday: () => void
}

const AgendaContext = createContext<AgendaContextValue | null>(null)

export function AgendaProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDateState] = useState(loadPersistedDate)
  const [selectedProfessionalId, setSelectedProfessionalIdState] = useState(loadPersistedProfessionalId)

  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateState(date)
    persistDate(date)
  }, [])

  const setSelectedProfessionalId = useCallback((id: string) => {
    setSelectedProfessionalIdState(id)
    persistProfessionalId(id)
  }, [])

  const goToPreviousDay = useCallback(() => {
    setSelectedDateState((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() - 1)
      persistDate(newDate)
      return newDate
    })
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDateState((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() + 1)
      persistDate(newDate)
      return newDate
    })
  }, [])

  const goToToday = useCallback(() => {
    const today = new Date()
    setSelectedDateState(today)
    persistDate(today)
  }, [])

  return (
    <AgendaContext.Provider
      value={{
        selectedDate,
        setSelectedDate,
        selectedProfessionalId,
        setSelectedProfessionalId,
        goToPreviousDay,
        goToNextDay,
        goToToday,
      }}
    >
      {children}
    </AgendaContext.Provider>
  )
}

export function useAgendaContext(): AgendaContextValue {
  const context = useContext(AgendaContext)
  if (!context) {
    throw new Error("useAgendaContext must be used within an AgendaProvider")
  }
  return context
}
