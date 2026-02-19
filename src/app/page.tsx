"use client"

import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
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

// --- Main Page ---

export default function Home() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { data: dashboard, isLoading: dashboardLoading } = useDashboard()
  const { canRead: canReadUsers } = usePermission("users")
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

  // Not authenticated - show login prompt
  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <StethoscopeIcon className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Clinica</h1>
            <p className="mt-2 text-muted-foreground">Sistema de gestao de consultas</p>
          </div>

          <Card elevation="lg" className="p-6">
            <p className="text-sm text-muted-foreground mb-6">
              Faca login para acessar sua agenda e gerenciar pacientes.
            </p>
            <Link
              href="/login"
              className="block w-full h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-all duration-normal active:scale-[0.98] flex items-center justify-center shadow-md hover:shadow-lg"
            >
              Entrar
            </Link>
          </Card>
        </div>
      </main>
    )
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
