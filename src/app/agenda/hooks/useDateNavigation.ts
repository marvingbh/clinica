import { useState, useCallback } from "react"
import { toDateString } from "../lib/utils"

const STORAGE_KEY = "clinica:selectedDate"

function loadPersistedDate(): Date {
  if (typeof window === "undefined") return new Date()
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (stored) {
    const [year, month, day] = stored.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    if (!isNaN(date.getTime())) return date
  }
  return new Date()
}

function persistDate(date: Date) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(STORAGE_KEY, toDateString(date))
  }
}

export interface UseDateNavigationReturn {
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  showDatePicker: boolean
  setShowDatePicker: (show: boolean) => void
  goToPreviousDay: () => void
  goToNextDay: () => void
  goToToday: () => void
}

export function useDateNavigation(): UseDateNavigationReturn {
  const [selectedDate, setSelectedDateState] = useState(loadPersistedDate)
  const [showDatePicker, setShowDatePicker] = useState(false)

  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateState(date)
    persistDate(date)
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
    setShowDatePicker(false)
  }, [])

  return {
    selectedDate,
    setSelectedDate,
    showDatePicker,
    setShowDatePicker,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  }
}
