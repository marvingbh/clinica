export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid"
export type AccessLevel = "full_access" | "full_access_warning" | "read_only"

export interface SubscriptionInfo {
  subscriptionStatus: string
  trialEndsAt: Date | null
}

export interface SubscriptionBanner {
  type: "info" | "warning" | "error"
  message: string
}

export function getSubscriptionAccess(info: SubscriptionInfo): AccessLevel {
  const { subscriptionStatus, trialEndsAt } = info
  if (subscriptionStatus === "active") return "full_access"
  if (subscriptionStatus === "trialing") {
    if (trialEndsAt && new Date() < trialEndsAt) return "full_access"
    return "read_only"
  }
  if (subscriptionStatus === "past_due") return "full_access_warning"
  return "read_only"
}

export function isReadOnly(info: SubscriptionInfo): boolean {
  return getSubscriptionAccess(info) === "read_only"
}

export function canMutate(info: SubscriptionInfo): boolean {
  return !isReadOnly(info)
}

export function getSubscriptionBanner(info: SubscriptionInfo): SubscriptionBanner | null {
  const { subscriptionStatus, trialEndsAt } = info
  if (subscriptionStatus === "active") return null
  if (subscriptionStatus === "trialing") {
    if (trialEndsAt && new Date() < trialEndsAt) {
      const daysLeft = Math.ceil((trialEndsAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      return { type: "info", message: `Periodo de teste: ${daysLeft} dias restantes. Assine para continuar usando apos o teste.` }
    }
    return { type: "error", message: "Seu periodo de teste expirou. Assine para continuar usando o sistema." }
  }
  if (subscriptionStatus === "past_due") {
    return { type: "warning", message: "Houve um problema com seu pagamento. Atualize seus dados de pagamento." }
  }
  if (subscriptionStatus === "canceled") {
    return { type: "error", message: "Sua assinatura foi cancelada. Assine novamente para continuar." }
  }
  return { type: "error", message: "Sua assinatura esta inativa. Regularize o pagamento para continuar." }
}
