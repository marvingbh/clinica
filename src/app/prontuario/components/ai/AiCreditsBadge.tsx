"use client"

interface AiCreditsBadgeProps {
  /** null = unlimited. */
  remaining: number | null
}

/** Small badge showing remaining monthly generations. */
export function AiCreditsBadge({ remaining }: AiCreditsBadgeProps) {
  const label =
    remaining === null
      ? "Gerações ilimitadas"
      : `${remaining} ${remaining === 1 ? "geração restante" : "gerações restantes"} neste mês`
  return (
    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{label}</span>
  )
}
