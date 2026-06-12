"use client"

import type { TabProps } from "../types"
import ConnectStatusCard from "./ConnectStatusCard"
import DunningConfigForm from "./DunningConfigForm"

/** Configurações → aba "Pagamentos": status Connect + régua de cobrança. */
export default function PaymentsTab({ settings }: TabProps) {
  const monthlyMode = settings.billingMode === "MONTHLY_FIXED"

  return (
    <div className="space-y-6">
      <ConnectStatusCard />
      <DunningConfigForm monthlyMode={monthlyMode} />
    </div>
  )
}
