"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"

interface PlanInfo {
  id: string
  name: string
  slug: string
  priceInCents: number
  maxProfessionals: number
}

interface BillingStatus {
  currentPlan: PlanInfo | null
  subscriptionStatus: string
  trialEndsAt: string | null
  hasSubscription: boolean
  plans: PlanInfo[]
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  trialing: {
    label: "Em teste",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  active: {
    label: "Ativo",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  past_due: {
    label: "Pagamento pendente",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  canceled: {
    label: "Cancelado",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  unpaid: {
    label: "Inativo",
    className: "bg-red-100 text-red-800 border-red-200",
  },
}

function formatPrice(priceInCents: number): string {
  return (priceInCents / 100).toFixed(2).replace(".", ",")
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function BillingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status: sessionStatus } = useSession()
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  // Show toast from query params
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Assinatura realizada com sucesso!")
    }
    if (searchParams.get("canceled") === "true") {
      toast.info("Checkout cancelado.")
    }
  }, [searchParams])

  const fetchBilling = useCallback(async () => {
    try {
      const response = await fetch("/api/billing/status")
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login")
          return
        }
        throw new Error("Failed to fetch billing status")
      }
      const data: BillingStatus = await response.json()
      setBilling(data)
    } catch {
      toast.error("Erro ao carregar informacoes de assinatura")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login")
      return
    }
    if (sessionStatus === "authenticated") {
      fetchBilling()
    }
  }, [sessionStatus, router, fetchBilling])

  async function handleCheckout(planId: string) {
    setCheckoutLoading(planId)
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao iniciar checkout")
      }
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao iniciar checkout"
      )
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao abrir portal")
      }
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao abrir portal"
      )
    } finally {
      setPortalLoading(false)
    }
  }

  if (sessionStatus === "loading" || isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="h-6 w-24 bg-muted rounded" />
              <div className="h-8 w-32 bg-muted rounded" />
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-10 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!billing) {
    return null
  }

  const statusInfo = STATUS_LABELS[billing.subscriptionStatus] ?? {
    label: billing.subscriptionStatus,
    className: "bg-muted text-muted-foreground border-border",
  }

  return (
    <div className="space-y-8">
      {/* Current Plan Card */}
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Plano atual</h2>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusInfo.className}`}
          >
            {statusInfo.label}
          </span>
        </div>

        {billing.currentPlan ? (
          <div className="space-y-2">
            <p className="text-foreground">
              <span className="font-medium">{billing.currentPlan.name}</span>
              {" - "}
              <span className="text-muted-foreground">
                R$ {formatPrice(billing.currentPlan.priceInCents)}/mes
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Ate {billing.currentPlan.maxProfessionals} profissiona
              {billing.currentPlan.maxProfessionals === 1 ? "l" : "is"}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Nenhum plano selecionado</p>
        )}

        {billing.subscriptionStatus === "trialing" && billing.trialEndsAt && (
          <p className="text-sm text-blue-600 mt-3">
            Periodo de teste termina em {formatDate(billing.trialEndsAt)}
          </p>
        )}

        {billing.hasSubscription && (
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="mt-4 h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {portalLoading ? "Abrindo..." : "Gerenciar assinatura"}
          </button>
        )}
      </div>

      {/* Available Plans */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Planos disponiveis
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {billing.plans.map((plan) => {
            const isCurrentPlan = billing.currentPlan?.id === plan.id
            return (
              <div
                key={plan.id}
                className={`bg-card border rounded-lg p-6 shadow-sm flex flex-col ${
                  isCurrentPlan
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border"
                }`}
              >
                <h3 className="text-lg font-semibold text-foreground">
                  {plan.name}
                </h3>
                <p className="text-2xl font-bold text-foreground mt-2">
                  R$ {formatPrice(plan.priceInCents)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /mes
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Ate {plan.maxProfessionals} profissiona
                  {plan.maxProfessionals === 1 ? "l" : "is"}
                </p>
                <div className="mt-auto pt-4">
                  {isCurrentPlan ? (
                    <span className="block text-center text-sm font-medium text-primary py-2">
                      Plano atual
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                      className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {checkoutLoading === plan.id ? "Aguarde..." : "Assinar"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BillingFallback() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="h-6 w-32 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">Assinatura</h1>
      <Suspense fallback={<BillingFallback />}>
        <BillingContent />
      </Suspense>
    </main>
  )
}
