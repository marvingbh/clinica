export interface DefaultCategory {
  name: string
  color: string
  icon: string
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Aluguel", color: "#8B5CF6", icon: "building" },
  { name: "Energia", color: "#F59E0B", icon: "zap" },
  { name: "Água", color: "#3B82F6", icon: "droplets" },
  { name: "Internet/Telefone", color: "#6366F1", icon: "wifi" },
  { name: "Material de Escritório", color: "#10B981", icon: "package" },
  { name: "Software/Assinaturas", color: "#EC4899", icon: "monitor" },
  { name: "Limpeza", color: "#14B8A6", icon: "sparkles" },
  { name: "Manutenção", color: "#F97316", icon: "wrench" },
  { name: "Marketing", color: "#A855F7", icon: "megaphone" },
  { name: "Capacitação", color: "#06B6D4", icon: "graduation-cap" },
  { name: "Honorários Profissionais", color: "#84CC16", icon: "briefcase" },
  { name: "Impostos", color: "#EF4444", icon: "receipt" },
  { name: "Gastos com Cartão", color: "#D946EF", icon: "credit-card" },
  { name: "Benefícios", color: "#7C3AED", icon: "heart-handshake" },
  { name: "Empréstimos", color: "#B45309", icon: "landmark" },
  { name: "Investimentos", color: "#0D9488", icon: "trending-up" },
  { name: "Lucros e Dividendos", color: "#059669", icon: "banknote" },
  { name: "Outros", color: "#6B7280", icon: "ellipsis" },
]
