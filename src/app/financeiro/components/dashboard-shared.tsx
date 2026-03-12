import { formatCurrencyBRL } from "@/lib/financeiro/format"

export interface DashboardData {
  year: number
  month: number | null
  totalFaturado: number
  totalPendente: number
  totalEnviado: number
  totalParcial: number
  totalPago: number
  totalSessions: number
  totalCredits: number
  totalExtras: number
  invoiceCount: number
  pendingCount: number
  enviadoCount: number
  parcialCount: number
  paidCount: number
  availableCredits: number
  byMonth: Record<number, MonthSummary>
  byProfessional: ProfessionalSummary[]
}

export interface MonthSummary {
  faturado: number; pendente: number; enviado: number; parcial: number; pago: number
  sessions: number; credits: number; extras: number
  invoiceCount: number; pendingCount: number; enviadoCount: number; parcialCount: number; paidCount: number
}

export interface ProfessionalSummary {
  id: string; name: string
  faturado: number; pendente: number; enviado: number; parcial: number; pago: number
  sessions: number; invoiceCount: number; patientCount: number
}

export interface InsightsData {
  inadimplencia: { unpaidCount: number; unpaidAmount: number; unpaidRate: number }
  pagamentoAtraso: {
    lateCount: number; totalPaid: number; lateAmount: number
    lateRate: number; avgDaysLate: number
  }
  tempoRecebimento: { avgCollectionDays: number | null; prevAvgCollectionDays: number | null }
  ticketMedio: {
    avgTicket: number
    avgTicketByProfessional: Array<{ professionalId: string; name: string; avgTicket: number }>
  }
  cancelamento: {
    totalAppointments: number; cancelledCount: number; faltaCount: number
    cancellationRate: number; estimatedLostRevenue: number
  }
  concentracao: {
    topPatients: Array<{ patientId: string; patientName: string; amount: number; percentOfTotal: number }>
    top3Concentration: number
  }
  creditosAging: Record<string, { count: number; totalDays: number }>
  comparativo: {
    prevFaturado: number; prevPago: number; prevSessions: number
    deltaFaturado: number | null; deltaPago: number | null; deltaSessions: number | null
  }
  receitaPorDia: Array<{ day: string; revenue: number; sessions: number }>
}

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export const SHORT_MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export const CHART_COLORS = {
  faturado: "#6366f1", pago: "#22c55e", parcial: "#f97316",
  enviado: "#3b82f6", pendente: "#eab308", sessions: "#3b82f6",
  credits: "#ef4444", extras: "#f97316",
}

export const PIE_COLORS = ["#22c55e", "#f97316", "#3b82f6", "#eab308", "#ef4444"]

export function SummaryCard({ label, value, sub, variant }: {
  label: string; value: string; sub?: string
  variant?: "warning" | "success" | "info" | "orange" | "danger"
}) {
  const variantClasses = {
    warning: "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20",
    success: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20",
    info: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20",
    orange: "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20",
    danger: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20",
  }
  const cls = variant ? variantClasses[variant] : "border-border bg-card"
  return (
    <div className={`p-4 rounded-lg border ${cls}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }, i: number) => (
        <p key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{formatCurrencyBRL(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function DeltaIndicator({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-muted-foreground text-xs">sem dados anteriores</span>
  const color = value > 0 ? "text-green-600 dark:text-green-400"
    : value < 0 ? "text-red-600 dark:text-red-400"
    : "text-muted-foreground"
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : ""
  return (
    <span className={`text-sm font-medium ${color}`}>
      {arrow} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

export function MetricCard({ label, value, sub, detail }: {
  label: string; value: string; sub?: string; detail?: React.ReactNode
}) {
  return (
    <div className="p-4 rounded-lg border border-border">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      {detail && <div className="mt-2">{detail}</div>}
    </div>
  )
}
