"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"

export interface TodayScheduleItem {
  id: string
  scheduledAt: string
  duration: number
  status: string
  modality: string | null
  title: string | null
  patientName: string
  professionalName: string | null
}

export interface RecentInvoiceItem {
  id: string
  status: string
  amount: number
  paidAt: string | null
  referenceMonth: number
  referenceYear: number
  patientName: string
  professionalName: string
}

export interface DashboardData {
  canSeeFinances: boolean
  todayCount: number
  pendingCount: number
  weekCount: number
  statusBreakdown: { status: string; count: number }[]
  activePatients: number
  newPatientsThisMonth: number
  completionRate: number | null
  noShowRate: number | null
  nextAppointment: { patientName: string; time: string; type: string } | null
  todayRevenue: number | null
  monthlyRevenue: number | null
  prevMonthlyRevenue: number | null
  revenueDelta: number | null
  outstandingAmount: number | null
  outstandingCount: number
  todaySchedule: TodayScheduleItem[]
  recentInvoices: RecentInvoiceItem[]
  revenueSeries: {
    day: RevenuePoint[]
    week: RevenuePoint[]
    month: RevenuePoint[]
  }
}

export interface RevenuePoint {
  bucketStart: string
  total: number
}

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useMountEffect(() => {
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
  })

  return { data, isLoading, error }
}
