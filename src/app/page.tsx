"use client"

import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { useState, useEffect } from "react"
import {
  CalendarIcon,
  UsersIcon,
  SettingsIcon,
  UserIcon,
  LogOutIcon,
  ChevronRightIcon,
  PlusIcon,
  ClockIcon,
  StethoscopeIcon,
  ShieldIcon,
  TrendingUpIcon,
  DollarSignIcon,
  ActivityIcon,
  CalendarDaysIcon,
  BellIcon,
  BarChart3Icon,
} from "@/shared/components/ui/icons"
import { Card, CardContent } from "@/shared/components/ui/card"
import { Skeleton, SkeletonAvatar, SkeletonText } from "@/shared/components/ui/skeleton"
import { FAB } from "@/shared/components/ui/fab"
import { useDashboard } from "@/app/hooks/useDashboard"
import { usePermission } from "@/shared/hooks/usePermission"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts"

// --- Helpers ---

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

const STATUS_COLORS: Record<string, string> = {
  AGENDADO: "#3b82f6",
  CONFIRMADO: "#22c55e",
  CANCELADO_PACIENTE: "#ef4444",
  CANCELADO_PROFISSIONAL: "#f97316",
  NAO_COMPARECEU: "#6b7280",
  FINALIZADO: "#14b8a6",
}

const STATUS_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CANCELADO_PACIENTE: "Canc. paciente",
  CANCELADO_PROFISSIONAL: "Canc. profissional",
  NAO_COMPARECEU: "Faltou",
  FINALIZADO: "Finalizado",
}

const TYPE_LABELS: Record<string, string> = {
  CONSULTA: "Consulta",
  TAREFA: "Tarefa",
  LEMBRETE: "Lembrete",
  NOTA: "Nota",
  REUNIAO: "Reuniao",
}

// --- Skeleton ---

function HomeSkeleton() {
  return (
    <main className="min-h-screen bg-background pb-24">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/5 via-background to-background px-4 pt-12 pb-8">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-6 w-48" />
        </div>
      </div>

      {/* Quick Stats 2x2 */}
      <div className="max-w-4xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} elevation="md" className="p-4">
              <Skeleton className="h-8 w-12 mb-2" />
              <Skeleton className="h-4 w-20" />
            </Card>
          ))}
        </div>
      </div>

      {/* Next appointment */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <Card elevation="md" className="p-4">
          <Skeleton className="h-5 w-40 mb-3" />
          <Skeleton className="h-4 w-56" />
        </Card>
      </div>

      {/* Chart placeholder */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <Card elevation="md" className="p-4">
          <Skeleton className="h-5 w-32 mb-3" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </Card>
      </div>

      {/* Action Cards */}
      <div className="max-w-4xl mx-auto px-4">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} elevation="sm" className="p-4">
              <div className="flex items-center gap-4">
                <SkeletonAvatar size="lg" />
                <div className="flex-1">
                  <SkeletonText lines={2} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}

// --- Components ---

function QuickStatCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType
  value: string | number
  label: string
  color: string
}) {
  return (
    <Card elevation="md" hoverable className="overflow-hidden">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function NextAppointmentCard({
  appointment,
}: {
  appointment: { patientName: string; time: string; type: string } | null
}) {
  return (
    <Link href="/agenda">
      <Card elevation="md" hoverable className="overflow-hidden border-l-4 border-l-primary">
        <CardContent className="py-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Proximo agendamento
          </p>
          {appointment ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{appointment.patientName}</p>
                <p className="text-sm text-muted-foreground">{formatTime(appointment.time)}</p>
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                {TYPE_LABELS[appointment.type] ?? appointment.type}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum agendamento proximo</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function StatusChart({ breakdown }: { breakdown: { status: string; count: number }[] }) {
  const data = breakdown.map((item) => ({
    name: STATUS_LABELS[item.status] ?? item.status,
    value: item.count,
    color: STATUS_COLORS[item.status] ?? "#6b7280",
  }))

  return (
    <Card elevation="md" className="overflow-hidden">
      <CardContent className="py-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Status de hoje
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function RevenueCards({
  todayRevenue,
  monthlyRevenue,
}: {
  todayRevenue: number
  monthlyRevenue: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card elevation="md" className="overflow-hidden">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSignIcon className="w-4 h-4 text-success" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Hoje
            </p>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(todayRevenue)}</p>
        </CardContent>
      </Card>
      <Card elevation="md" className="overflow-hidden">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSignIcon className="w-4 h-4 text-success" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Mes
            </p>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(monthlyRevenue)}</p>
        </CardContent>
      </Card>
    </div>
  )
}

interface ActionCardProps {
  href: string
  icon: React.ElementType
  iconBgColor: string
  iconColor: string
  title: string
  description: string
}

function ActionCard({ href, icon: Icon, iconBgColor, iconColor, title, description }: ActionCardProps) {
  return (
    <Link href={href}>
      <Card elevation="sm" hoverable className="group">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${iconBgColor} flex items-center justify-center flex-shrink-0 transition-transform duration-normal group-hover:scale-105`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground truncate">{description}</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-normal group-hover:translate-x-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function LogoutCard({ onLogout }: { onLogout: () => void }) {
  return (
    <button onClick={onLogout} className="w-full text-left">
      <Card elevation="sm" hoverable className="group">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0 transition-transform duration-normal group-hover:scale-105">
              <LogOutIcon className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-destructive">Sair</p>
              <p className="text-sm text-muted-foreground">Encerrar sessao</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

// --- Landing Page ---

interface PlanData {
  id: string
  name: string
  slug: string
  maxProfessionals: number
  priceInCents: number
}

function PricingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <Skeleton className="h-6 w-24 mb-4" />
          <Skeleton className="h-10 w-32 mb-2" />
          <Skeleton className="h-4 w-40 mb-6" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

function LandingPage() {
  const [plans, setPlans] = useState<PlanData[]>([])
  const [plansLoading, setPlansLoading] = useState(true)

  useEffect(() => {
    fetch("/api/public/plans")
      .then((res) => res.json())
      .then((data) => {
        setPlans(data.plans ?? [])
      })
      .catch(() => {
        setPlans([])
      })
      .finally(() => {
        setPlansLoading(false)
      })
  }, [])

  function formatPrice(cents: number): string {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })
  }

  const features = [
    {
      icon: CalendarDaysIcon,
      title: "Agenda inteligente",
      description: "Consultas, recorrencias e grupos em uma agenda visual e intuitiva.",
      accent: "from-teal-500 to-cyan-500",
      iconBg: "bg-teal-500/10",
      iconColor: "text-teal-600",
    },
    {
      icon: UsersIcon,
      title: "Gestao de pacientes",
      description: "Cadastro completo com historico, prontuario e consentimento LGPD.",
      accent: "from-blue-500 to-indigo-500",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
    },
    {
      icon: BellIcon,
      title: "Notificacoes automaticas",
      description: "Lembretes por WhatsApp e email para reduzir faltas e atrasos.",
      accent: "from-amber-500 to-orange-500",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600",
    },
    {
      icon: BarChart3Icon,
      title: "Relatorios e dashboard",
      description: "Metricas de atendimento, receita e comparecimento em tempo real.",
      accent: "from-purple-500 to-pink-500",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-600",
    },
  ]

  const stats = [
    { value: "14", label: "dias gratis", suffix: "" },
    { value: "100", label: "clinicas confiam", suffix: "+" },
    { value: "99.9", label: "uptime", suffix: "%" },
  ]

  const middleIndex = plans.length === 3 ? 1 : -1

  return (
    <main className="min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md shadow-teal-500/20">
              <StethoscopeIcon className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">Clinica</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-5 py-2.5 rounded-xl landing-btn-primary text-white"
            >
              Comecar gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-20 pb-24 md:pt-28 md:pb-32 landing-hero-bg">
        {/* Dot pattern background */}
        <div className="absolute inset-0 landing-dot-pattern opacity-40" />

        {/* Floating accent shapes */}
        <div
          className="absolute top-20 left-[10%] w-72 h-72 rounded-full bg-teal-400/8 blur-3xl"
          style={{ animation: "landing-float 8s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-10 right-[10%] w-96 h-96 rounded-full bg-blue-400/6 blur-3xl"
          style={{ animation: "landing-float 10s ease-in-out infinite 2s" }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="landing-animate-up landing-animate-up-1">
            <span className="inline-flex items-center gap-2 text-sm font-medium px-4 py-1.5 rounded-full bg-teal-500/10 text-teal-700 border border-teal-500/20 mb-8">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              14 dias gratis, sem cartao de credito
            </span>
          </div>

          <h1 className="landing-animate-up landing-animate-up-2 text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
            <span className="text-foreground">Gerencie sua clinica</span>
            <br />
            <span className="landing-gradient-text">de forma simples</span>
          </h1>

          <p className="landing-animate-up landing-animate-up-3 mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Agenda, pacientes, notificacoes e relatorios em uma unica plataforma.
            Tudo que voce precisa para focar no que importa: seus pacientes.
          </p>

          {/* CTA buttons */}
          <div className="landing-animate-up landing-animate-up-4 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center text-base font-semibold px-8 py-3.5 rounded-xl landing-btn-primary text-white min-w-[220px]"
            >
              Comecar gratuitamente
              <ChevronRightIcon className="w-4 h-4 ml-2" />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center text-base font-medium px-8 py-3.5 rounded-xl border border-border text-foreground hover:bg-muted/50 transition-colors min-w-[220px]"
            >
              Conhecer recursos
            </Link>
          </div>

          {/* Social proof stats */}
          <div className="landing-animate-up landing-animate-up-5 mt-16 flex items-center justify-center gap-8 sm:gap-12">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">
                  {stat.value}
                  <span className="text-teal-600">{stat.suffix}</span>
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 md:py-28 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Recursos</span>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              Tudo que sua clinica precisa
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Ferramentas pensadas para o dia a dia de clinicas e consultorios de saude.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="group relative bg-card border border-border/60 rounded-2xl p-7 shadow-sm hover:shadow-lg transition-all duration-300 landing-card-glow"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {/* Top accent line */}
                  <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r ${feature.accent} opacity-0 group-hover:opacity-60 transition-opacity duration-300`} />

                  <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 md:py-28 relative">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-teal-500/[0.02] to-transparent" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Planos</span>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              Simples e transparente
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Escolha o plano ideal para sua clinica. Todos incluem 14 dias de teste gratis.
            </p>
          </div>

          {plansLoading ? (
            <PricingSkeleton />
          ) : plans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
              {plans.map((plan, index) => {
                const isPopular = index === middleIndex
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl p-7 flex flex-col transition-all duration-300 ${
                      isPopular
                        ? "landing-pricing-popular border-2 shadow-lg shadow-teal-500/10 scale-[1.02]"
                        : "bg-card border border-border/60 shadow-sm hover:shadow-md"
                    }`}
                  >
                    {isPopular && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/20 uppercase tracking-wide">
                        Popular
                      </span>
                    )}

                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>

                    <div className="mt-4 mb-1">
                      <span className="text-4xl font-extrabold text-foreground tracking-tight">
                        {formatPrice(plan.priceInCents)}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground ml-1">/mes</span>
                    </div>

                    <p className="text-sm text-muted-foreground mb-8">
                      {plan.maxProfessionals === -1
                        ? "Profissionais ilimitados"
                        : `Ate ${plan.maxProfessionals} ${plan.maxProfessionals === 1 ? "profissional" : "profissionais"}`}
                    </p>

                    {/* Feature list */}
                    <ul className="space-y-3 mb-8 flex-1">
                      {["Agenda completa", "Gestao de pacientes", "Notificacoes automaticas", "Relatorios"].map((item) => (
                        <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                          <span className="w-5 h-5 rounded-full bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3 h-3 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href="/signup"
                      className={`block w-full text-center text-sm font-semibold px-4 py-3 rounded-xl transition-all duration-200 ${
                        isPopular
                          ? "landing-btn-primary text-white"
                          : "bg-muted/80 text-foreground hover:bg-muted border border-border/50"
                      }`}
                    >
                      Comecar teste gratis
                    </Link>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="relative rounded-3xl overflow-hidden p-10 md:p-16 text-center">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800" />
            <div className="absolute inset-0 landing-dot-pattern opacity-10" />

            <div className="relative">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Pronto para transformar sua clinica?
              </h2>
              <p className="text-teal-100 max-w-lg mx-auto mb-8">
                Junte-se a centenas de clinicas que ja simplificaram sua gestao. Comece agora, sem compromisso.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center text-base font-semibold px-8 py-3.5 rounded-xl bg-white text-teal-700 hover:bg-teal-50 transition-colors shadow-lg"
              >
                Criar conta gratuitamente
                <ChevronRightIcon className="w-4 h-4 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
              <StethoscopeIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-foreground">Clinica</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Clinica. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </main>
  )
}

// --- Main Page ---

export default function Home() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { data: dashboard, isLoading: dashboardLoading } = useDashboard()
  const { canRead: canReadUsers, canWrite: canWriteUsers } = usePermission("users")
  const { canRead: canReadProfessionals } = usePermission("professionals")
  const { canRead: canReadClinicSettings } = usePermission("clinic_settings")

  async function handleLogout() {
    await signOut({ redirect: false })
    router.push("/login")
  }

  function handleNewAppointment() {
    router.push("/agenda")
  }

  // Loading state with skeleton
  if (status === "loading") {
    return <HomeSkeleton />
  }

  // Not authenticated - show landing page
  if (status === "unauthenticated") {
    return <LandingPage />
  }

  // Get current time greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"
  const firstName = session?.user?.name?.split(" ")[0] || "Usuario"

  // Show skeleton while dashboard loads
  if (dashboardLoading || !dashboard) {
    return <HomeSkeleton />
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      {/* A. Hero Section */}
      <div className="bg-gradient-to-br from-primary/5 via-background to-background px-4 pt-12 pb-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-muted-foreground text-sm font-medium">{greeting},</p>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mt-1">
            {firstName}
          </h1>
        </div>
      </div>

      {/* B. Quick Stats 2x2 */}
      <div className="max-w-4xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <QuickStatCard
            icon={CalendarIcon}
            value={dashboard.todayCount}
            label="Hoje"
            color="bg-info"
          />
          <QuickStatCard
            icon={ClockIcon}
            value={dashboard.pendingCount}
            label="Pendentes"
            color="bg-warning"
          />
          <QuickStatCard
            icon={ActivityIcon}
            value={dashboard.activePatients}
            label="Pacientes ativos"
            color="bg-success"
          />
          <QuickStatCard
            icon={TrendingUpIcon}
            value={dashboard.completionRate !== null ? `${dashboard.completionRate}%` : "—"}
            label="Comparecimento"
            color="bg-purple-500"
          />
        </div>
      </div>

      {/* C. Next Appointment */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <NextAppointmentCard appointment={dashboard.nextAppointment} />
      </div>

      {/* D. Today's Status Chart */}
      {dashboard.todayCount > 0 && dashboard.statusBreakdown.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mb-6">
          <StatusChart breakdown={dashboard.statusBreakdown} />
        </div>
      )}

      {/* E. Revenue Cards (clinic settings permission) */}
      {canReadClinicSettings && dashboard.todayRevenue !== null && dashboard.monthlyRevenue !== null && (
        <div className="max-w-4xl mx-auto px-4 mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Faturamento
          </p>
          <RevenueCards
            todayRevenue={dashboard.todayRevenue}
            monthlyRevenue={dashboard.monthlyRevenue}
          />
        </div>
      )}

      {/* F. Action Cards */}
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Menu Principal
        </h2>

        <div className="space-y-3">
          <ActionCard
            href="/agenda"
            icon={CalendarIcon}
            iconBgColor="bg-primary/10"
            iconColor="text-primary"
            title="Agenda"
            description="Ver e gerenciar agendamentos"
          />

          <ActionCard
            href="/patients"
            icon={UsersIcon}
            iconBgColor="bg-success/10"
            iconColor="text-success"
            title="Pacientes"
            description="Cadastro e historico"
          />

          {canReadUsers && (
            <ActionCard
              href="/users"
              icon={ShieldIcon}
              iconBgColor="bg-purple-500/10"
              iconColor="text-purple-500"
              title="Usuários"
              description="Gerenciar contas de acesso"
            />
          )}

          {canWriteUsers && (
            <ActionCard
              href="/admin/permissions"
              icon={ShieldIcon}
              iconBgColor="bg-indigo-500/10"
              iconColor="text-indigo-500"
              title="Permissões"
              description="Gerenciar permissoes de acesso"
            />
          )}

          {canReadProfessionals && (
            <ActionCard
              href="/professionals"
              icon={StethoscopeIcon}
              iconBgColor="bg-warning/10"
              iconColor="text-warning"
              title="Profissionais"
              description="Gerenciar equipe"
            />
          )}

          <ActionCard
            href="/settings/availability"
            icon={SettingsIcon}
            iconBgColor="bg-info/10"
            iconColor="text-info"
            title="Configuracoes"
            description="Disponibilidade e preferencias"
          />
        </div>

        {/* G. Account Section */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mt-8 mb-4">
          Conta
        </h2>

        <div className="space-y-3">
          <ActionCard
            href="/profile"
            icon={UserIcon}
            iconBgColor="bg-gray-100 dark:bg-gray-800"
            iconColor="text-gray-600 dark:text-gray-400"
            title="Meu Perfil"
            description="Dados pessoais e profissionais"
          />

          <LogoutCard onLogout={handleLogout} />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          {session?.user?.email}
        </p>
      </div>

      {/* FAB for primary action - New Appointment */}
      <FAB
        onClick={handleNewAppointment}
        icon={<PlusIcon className="w-6 h-6" />}
        label="Novo agendamento"
        color="primary"
        elevation="lg"
      />
    </main>
  )
}
