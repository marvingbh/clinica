"use client"

import { useEffect, useState } from "react"
import { Building2, Users, CreditCard, AlertTriangle, Clock, DollarSign } from "lucide-react"

interface DashboardData {
  totalClinics: number
  activeTrial: number
  activeSubscription: number
  canceledCount: number
  pastDueCount: number
  mrrInCents: number
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const statCards = [
  { key: "totalClinics", label: "Total de clinicas", icon: Building2, color: "text-foreground" },
  { key: "activeTrial", label: "Em teste", icon: Clock, color: "text-blue-600" },
  { key: "activeSubscription", label: "Assinantes ativos", icon: Users, color: "text-green-600" },
  { key: "canceledCount", label: "Cancelados", icon: AlertTriangle, color: "text-red-600" },
  { key: "pastDueCount", label: "Inadimplentes", icon: CreditCard, color: "text-yellow-600" },
] as const

export default function SuperAdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/superadmin/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao carregar dashboard")
        return res.json()
      })
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-destructive/10 text-destructive rounded-lg p-4">
          {error}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => (
          <div
            key={card.key}
            className="bg-card border border-border rounded-xl p-6 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">
                {card.label}
              </span>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold text-foreground">
              {data[card.key]}
            </p>
          </div>
        ))}

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">
              MRR
            </span>
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-foreground">
            {formatCurrency(data.mrrInCents)}
          </p>
        </div>
      </div>
    </div>
  )
}
