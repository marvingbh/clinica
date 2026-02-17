"use client"

import { useState, useEffect } from "react"

export interface DashboardData {
  todayCount: number
  pendingCount: number
  weekCount: number
  statusBreakdown: { status: string; count: number }[]
  activePatients: number
  newPatientsThisMonth: number
  completionRate: number | null
  nextAppointment: { patientName: string; time: string; type: string } | null
  todayRevenue: number | null
  monthlyRevenue: number | null
}

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchDashboard() {
      try {
        const res = await fetch("/api/dashboard")
        if (!res.ok) throw new Error("Erro ao carregar dashboard")
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro desconhecido")
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchDashboard()
    const interval = setInterval(fetchDashboard, REFRESH_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return { data, isLoading, error }
}
