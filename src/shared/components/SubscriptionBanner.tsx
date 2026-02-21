"use client"

import { useSession } from "next-auth/react"
import { useMemo } from "react"
import Link from "next/link"
import { AlertTriangle, Info, XCircle } from "lucide-react"
import { getSubscriptionBanner, type SubscriptionInfo } from "@/lib/subscription"

export function SubscriptionBanner() {
  const { data: session } = useSession()

  const banner = useMemo(() => {
    if (!session?.user?.subscriptionStatus) return null

    const info: SubscriptionInfo = {
      subscriptionStatus: session.user.subscriptionStatus,
      trialEndsAt: null,
    }

    return getSubscriptionBanner(info)
  }, [session?.user?.subscriptionStatus])

  if (!banner) return null

  const bgColor =
    banner.type === "error"
      ? "bg-destructive/10 border-destructive/20 text-destructive"
      : banner.type === "warning"
        ? "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200"
        : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"

  const Icon =
    banner.type === "error" ? XCircle : banner.type === "warning" ? AlertTriangle : Info

  return (
    <div className={`border-b px-4 py-2 text-sm flex items-center gap-2 ${bgColor}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{banner.message}</span>
      <Link
        href="/admin/billing"
        className="font-medium underline hover:no-underline shrink-0"
      >
        Gerenciar assinatura
      </Link>
    </div>
  )
}
