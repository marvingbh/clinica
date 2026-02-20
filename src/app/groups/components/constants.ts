"use client"

export const DAY_OF_WEEK_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
]

export const RECURRENCE_TYPE_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
}

// Date helper for native date picker default value
export function getTodayISO(): string {
  return new Date().toISOString().split("T")[0]
}
