"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  PlusIcon,
  DollarSignIcon,
  CalendarIcon,
  FileTextIcon,
  UsersIcon,
} from "@/shared/components/ui/icons"
import { Badge } from "@/shared/components/ui/badge"
import { Avatar } from "@/shared/components/ui/avatar"
import { Button } from "@/shared/components/ui/button"
import { DashboardSearch } from "./DashboardSearch"
import { KPI, KPIGrid } from "@/shared/components/ui/kpi"
import { Panel, PanelHead, PanelBody } from "@/shared/components/ui/panel"
import { RevenueChart } from "@/shared/components/ui/revenue-chart"
import {
  useDashboard,
  type DashboardData,
  type TodayScheduleItem,
  type RecentInvoiceItem,
} from "@/app/hooks/useDashboard"
import { LandingPage } from "./landing/LandingPage"

/* ============================================
   Formatting helpers
   ============================================ */

function formatCurrency(value: number | null): {
  prefix: string
  whole: string
  cents: string
} {
  if (value == null) return { prefix: "R$", whole: "—", cents: "" }
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const [whole, cents] = formatted.split(",")
  return { prefix: "R$", whole, cents: `,${cents ?? "00"}` }
}

function formatTimeHM(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDateLong(d: Date): string {
  const weekday = d
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(/\.$/, "")
  const day = d
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(/\.$/, "")
  return `${capitalize(weekday)}, ${day}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

/* ============================================
   Status badge mappings
   ============================================ */

type BadgeTone = "ok" | "brand" | "warn" | "err" | "neutral"

const APPT_STATUS_TONE: Record<string, { tone: BadgeTone; label: string }> = {
  CONFIRMADO: { tone: "ok", label: "Confirmado" },
  AGENDADO: { tone: "brand", label: "Agendado" },
  FINALIZADO: { tone: "ok", label: "Finalizado" },
  CANCELADO_ACORDADO: { tone: "neutral", label: "Cancelado" },
  CANCELADO_FALTA: { tone: "err", label: "Faltou" },
  CANCELADO_PROFISSIONAL: { tone: "warn", label: "Remarcar" },
}

const INVOICE_STATUS_TONE: Record<string, { tone: BadgeTone; label: string }> = {
  PAGO: { tone: "ok", label: "Pago" },
  PARCIAL: { tone: "warn", label: "Parcial" },
  PENDENTE: { tone: "warn", label: "Pendente" },
  ENVIADO: { tone: "brand", label: "Enviado" },
  CANCELADO: { tone: "neutral", label: "Cancelado" },
}

const MONTH_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

/* ============================================
   Page
   ============================================ */

export default function HomePage() {
  const { data: session, status } = useSession()
  const { data, isLoading } = useDashboard()

  // Unauthenticated visitors see the public marketing landing page.
  if (status === "unauthenticated") {
    return <LandingPage />
  }

  const name = session?.user?.name ?? "colega"
  const firstName = name.split(" ")[0] ?? name
  const now = new Date()
  const greeting = greetingFor(now.getHours())

  const subCounts = [
    data ? `${data.todayCount} compromissos hoje` : null,
    data && data.outstandingCount > 0
      ? `${data.outstandingCount} ${data.outstandingCount === 1 ? "fatura" : "faturas"} em aberto`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <main className="min-h-screen bg-ink-50 pb-24 md:pb-12">
      {/* Header */}
      <section className="bg-card border-b border-ink-200 px-4 md:px-6 py-4 md:py-5">
        <div className="max-w-[1320px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-[22px] font-semibold text-ink-900 tracking-tight leading-tight truncate">
              {greeting}, {firstName}
            </h1>
            <p className="text-[13px] text-ink-500 mt-1">
              {formatDateLong(now)}
              {subCounts && ` · ${subCounts}`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <DashboardSearch />
            <Link href="/agenda" className="flex-shrink-0">
              <Button variant="primary" size="md" leftIcon={<PlusIcon className="w-4 h-4" />}>
                Novo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Body — layout branches on finance access.
          Admin / finance users see the revenue/outstanding KPIs, chart,
          and recent-payments table. Professionals without finance access
          get an agenda-first view with schedule-oriented KPIs and no
          money data. */}
      <section className="max-w-[1320px] mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        <KpiRow data={data} isLoading={isLoading} />

        {data?.canSeeFinances ?? true ? (
          <>
            <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
              <RevenuePanel data={data} isLoading={isLoading} />
              <TodayPanel data={data} isLoading={isLoading} />
            </div>
            <RecentPaymentsPanel data={data} isLoading={isLoading} />
          </>
        ) : (
          <TodayPanel data={data} isLoading={isLoading} full />
        )}
      </section>
    </main>
  )
}

/* ============================================
   KPI row
   ============================================ */

function KpiRow({
  data,
  isLoading,
}: {
  data: DashboardData | null
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <KPIGrid>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-card border border-ink-200 rounded-lg px-5 py-4 h-[108px] animate-pulse"
          />
        ))}
      </KPIGrid>
    )
  }

  return data?.canSeeFinances ? <FinanceKpis data={data} /> : <AgendaKpis data={data} />
}

function FinanceKpis({ data }: { data: DashboardData | null }) {
  const revenue = formatCurrency(data?.monthlyRevenue ?? null)
  const outstanding = formatCurrency(data?.outstandingAmount ?? null)
  const deltaPct = data?.revenueDelta ?? null
  const noShow = data?.noShowRate ?? null

  return (
    <KPIGrid>
      <KPI
        label="Receita · mês"
        icon={<DollarSignIcon className="w-3 h-3" strokeWidth={2} />}
        value={
          <>
            <span className="text-sm text-ink-500 font-medium mr-1">{revenue.prefix}</span>
            {revenue.whole}
            <span className="text-sm text-ink-500 font-medium">{revenue.cents}</span>
          </>
        }
        delta={
          deltaPct !== null
            ? {
                direction: deltaPct >= 0 ? "up" : "down",
                value: `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`,
                sub: " vs mês anterior",
              }
            : undefined
        }
      />
      <KPI
        label="Consultas · semana"
        icon={<CalendarIcon className="w-3 h-3" strokeWidth={2} />}
        value={data?.weekCount ?? "—"}
        delta={
          data && data.todayCount > 0
            ? {
                direction: "up",
                intent: "good",
                value: `${data.todayCount}`,
                sub: " hoje",
              }
            : undefined
        }
      />
      <KPI
        label="Em aberto"
        icon={<FileTextIcon className="w-3 h-3" strokeWidth={2} />}
        value={
          <>
            <span className="text-sm text-ink-500 font-medium mr-1">{outstanding.prefix}</span>
            {outstanding.whole}
            <span className="text-sm text-ink-500 font-medium">{outstanding.cents}</span>
          </>
        }
        delta={
          data && data.outstandingCount > 0
            ? {
                direction: "down",
                intent: "bad",
                value: `${data.outstandingCount}`,
                sub: data.outstandingCount === 1 ? " fatura" : " faturas",
              }
            : undefined
        }
      />
      <KPI
        label="Taxa de falta"
        icon={<UsersIcon className="w-3 h-3" strokeWidth={2} />}
        value={
          noShow !== null ? (
            <>
              {noShow.toFixed(1)}
              <span className="text-sm text-ink-500 font-medium">%</span>
            </>
          ) : (
            "—"
          )
        }
        delta={
          noShow !== null
            ? {
                direction: noShow < 5 ? "down" : "up",
                intent: noShow < 5 ? "good" : "bad",
                value: `${noShow.toFixed(1)}%`,
                sub: " últimos 30 dias",
              }
            : undefined
        }
      />
    </KPIGrid>
  )
}

function AgendaKpis({ data }: { data: DashboardData | null }) {
  const completion = data?.completionRate ?? null
  const noShow = data?.noShowRate ?? null

  return (
    <KPIGrid>
      <KPI
        label="Hoje"
        icon={<CalendarIcon className="w-3 h-3" strokeWidth={2} />}
        value={data?.todayCount ?? "—"}
        delta={
          data && data.pendingCount > 0
            ? {
                direction: "up",
                intent: "auto",
                value: `${data.pendingCount}`,
                sub: " aguardando confirmação",
              }
            : undefined
        }
      />
      <KPI
        label="Semana"
        icon={<CalendarIcon className="w-3 h-3" strokeWidth={2} />}
        value={data?.weekCount ?? "—"}
      />
      <KPI
        label="Pacientes ativos"
        icon={<UsersIcon className="w-3 h-3" strokeWidth={2} />}
        value={data?.activePatients ?? "—"}
        delta={
          data && data.newPatientsThisMonth > 0
            ? {
                direction: "up",
                intent: "good",
                value: `+${data.newPatientsThisMonth}`,
                sub: " este mês",
              }
            : undefined
        }
      />
      <KPI
        label="Taxa de comparecimento"
        icon={<UsersIcon className="w-3 h-3" strokeWidth={2} />}
        value={
          completion !== null ? (
            <>
              {completion}
              <span className="text-sm text-ink-500 font-medium">%</span>
            </>
          ) : (
            "—"
          )
        }
        delta={
          noShow !== null
            ? {
                direction: noShow < 5 ? "down" : "up",
                intent: noShow < 5 ? "good" : "bad",
                value: `${noShow.toFixed(1)}%`,
                sub: " faltas · 30 dias",
              }
            : undefined
        }
      />
    </KPIGrid>
  )
}

/* ============================================
   Revenue chart panel
   ============================================ */

type RangeKey = "day" | "week" | "month"
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
]
const RANGE_TITLE: Record<RangeKey, string> = {
  day: "Receita · últimos 30 dias",
  week: "Receita · últimas 12 semanas",
  month: "Receita · últimos 12 meses",
}

function RevenuePanel({
  data,
  isLoading,
}: {
  data: DashboardData | null
  isLoading: boolean
}) {
  const [range, setRange] = useState<RangeKey>("week")
  const series = data?.revenueSeries?.[range] ?? []

  return (
    <Panel className="lg:col-span-2">
      <PanelHead
        title={RANGE_TITLE[range]}
        actions={
          <div
            role="tablist"
            aria-label="Agrupamento"
            className="inline-flex rounded-[4px] border border-ink-300 overflow-hidden bg-card"
          >
            {RANGES.map((r, i) => (
              <button
                key={r.key}
                role="tab"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
                className={`
                  px-3 h-7 text-xs leading-none transition-colors duration-[120ms]
                  ${i > 0 ? "border-l border-ink-200" : ""}
                  ${
                    range === r.key
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "bg-transparent text-ink-600 hover:text-ink-900"
                  }
                `}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      <PanelBody>
        {isLoading || !data ? (
          <div className="h-[200px] animate-pulse bg-ink-100 rounded" />
        ) : (
          <RevenueChart data={series} granularity={range} />
        )}
      </PanelBody>
    </Panel>
  )
}

/* ============================================
   Today's schedule panel
   ============================================ */

function TodayPanel({
  data,
  isLoading,
  full = false,
}: {
  data: DashboardData | null
  isLoading: boolean
  full?: boolean
}) {
  const title = full
    ? `Agenda de hoje${data ? ` · ${data.todayCount}` : ""}`
    : "Agenda de hoje"

  return (
    <Panel>
      <PanelHead
        title={title}
        actions={
          <Link
            href="/agenda"
            className="text-[13px] text-ink-600 hover:text-brand-700 transition-colors"
          >
            Ver agenda completa →
          </Link>
        }
      />
      <PanelBody>
        {isLoading || !data ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse bg-ink-100 rounded" />
            ))}
          </div>
        ) : data.todaySchedule.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-[13px] text-ink-700 font-medium">Sem compromissos hoje.</div>
            <div className="text-[12px] text-ink-500 mt-1">
              Aproveite para revisar sua disponibilidade.
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {data.todaySchedule.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}

function AgendaRow({ item }: { item: TodayScheduleItem }) {
  const status = APPT_STATUS_TONE[item.status] ?? {
    tone: "neutral" as const,
    label: item.status,
  }
  const modality =
    item.modality === "ONLINE" ? "Online" : item.modality === "PRESENCIAL" ? "Presencial" : null
  const sub = [item.professionalName, modality].filter(Boolean).join(" · ")

  return (
    <div className="grid grid-cols-[60px_1fr_auto] items-center gap-3 py-3 border-b border-ink-100 last:border-b-0">
      <div>
        <div className="font-mono text-[12px] text-ink-700 font-medium leading-tight">
          {formatTimeHM(item.scheduledAt)}
        </div>
        <div className="font-mono text-[10px] text-ink-400 mt-0.5">
          {item.duration} min
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-900 leading-tight truncate">
          {item.patientName}
        </div>
        {sub && (
          <div className="text-[11px] text-ink-500 mt-0.5 truncate">{sub}</div>
        )}
      </div>
      <Badge tone={status.tone} dot>
        {status.label}
      </Badge>
    </div>
  )
}

/* ============================================
   Recent payments table panel
   ============================================ */

function RecentPaymentsPanel({
  data,
  isLoading,
}: {
  data: DashboardData | null
  isLoading: boolean
}) {
  const awaiting = data?.outstandingCount ?? 0

  return (
    <Panel>
      <PanelHead
        title="Pagamentos recentes"
        actions={
          <div className="flex items-center gap-2">
            {awaiting > 0 && <Badge tone="warn">{awaiting} aguardando</Badge>}
            <Link
              href="/financeiro"
              className="text-[13px] text-ink-600 hover:text-brand-700 transition-colors"
            >
              Abrir financeiro →
            </Link>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px] min-w-[640px]">
          <thead>
            <tr>
              {["Fatura", "Paciente", "Profissional", "Referência", "Valor", "Status"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={`
                      bg-ink-50 border-b border-ink-200
                      px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-500
                      ${i === 4 ? "text-right" : "text-left"}
                    `}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading || !data ? (
              [0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  {[0, 1, 2, 3, 4, 5].map((j) => (
                    <td
                      key={j}
                      className="px-3 py-3 border-b border-ink-100 last:border-b-0"
                    >
                      <div className="h-3 bg-ink-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.recentInvoices.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-[13px] text-ink-500"
                >
                  Nenhuma fatura recente.
                </td>
              </tr>
            ) : (
              data.recentInvoices.map((inv) => <InvoiceRow key={inv.id} inv={inv} />)
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function InvoiceRow({ inv }: { inv: RecentInvoiceItem }) {
  const status = INVOICE_STATUS_TONE[inv.status] ?? {
    tone: "neutral" as const,
    label: inv.status,
  }
  const shortId = `#INV-${inv.id.slice(-4).toUpperCase()}`
  const reference = `${MONTH_PT[inv.referenceMonth - 1] ?? "—"} ${inv.referenceYear}`
  const amount = formatCurrency(inv.amount)

  return (
    <tr className="hover:bg-ink-50 transition-colors">
      <td className="px-3 py-3 border-b border-ink-100 font-mono text-ink-800">
        <Link
          href={`/financeiro/faturas/${inv.id}`}
          className="hover:text-brand-700"
        >
          {shortId}
        </Link>
      </td>
      <td className="px-3 py-3 border-b border-ink-100 text-ink-800 truncate max-w-[180px]">
        {inv.patientName}
      </td>
      <td className="px-3 py-3 border-b border-ink-100 text-ink-800">
        <span className="inline-flex items-center gap-1.5">
          <Avatar size="sm" name={inv.professionalName} />
          <span className="truncate">{inv.professionalName}</span>
        </span>
      </td>
      <td className="px-3 py-3 border-b border-ink-100 text-ink-700">{reference}</td>
      <td className="px-3 py-3 border-b border-ink-100 text-right font-mono tabular-nums text-ink-800">
        {amount.prefix} {amount.whole}
        <span className="text-ink-500">{amount.cents}</span>
      </td>
      <td className="px-3 py-3 border-b border-ink-100">
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </td>
    </tr>
  )
}
