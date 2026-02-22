export function getFeeLabel(billingMode: string): string {
  return billingMode === "MONTHLY_FIXED" ? "Valor Mensal" : "Valor da Sessão"
}

export function getFeeLabelShort(billingMode: string): string {
  return billingMode === "MONTHLY_FIXED" ? "Valor Mensal (R$)" : "Preço Sessão (R$)"
}
